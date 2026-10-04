// Récupération des sources automatiques (sans clé, sans compte) et lecture de la dernière période.
// Aucune écriture ici : l'acceptation d'une réponse est décidée par scripts/refresh.mjs.

const UA = 'emeraude-estimateur/1.0 (pipeline de données publiques ; contact via le dépôt)';

export async function getJson(url, { tries = 3, timeoutMs = 30000, fetchImpl = fetch, retryDelayMs = 1500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < tries - 1) await new Promise((res) => setTimeout(res, retryDelayMs * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw last;
}

export async function getText(url, { timeoutMs = 30000, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// Insee Melodi : le code géographique est millésimé (ex. 2026-DEP-35).
export function inseeUrl(year) {
  return `https://api.insee.fr/melodi/data/DS_TOUR_FREQ?GEO=${year}-DEP-35&FREQ=M&ACTIVITY=I551&TOUR_MEASURE=PLACE_OCCUPANCY_RATE&maxResult=1000`;
}

export async function fetchInsee({ today = new Date(), fetchImpl, retryDelayMs } = {}) {
  const year = today.getUTCFullYear();
  let lastErr;
  for (const y of [year, year - 1, year + 1]) {
    const url = inseeUrl(y);
    try {
      const j = await getJson(url, { fetchImpl, retryDelayMs });
      if (Array.isArray(j.observations) && j.observations.length) return { url, data: j };
      lastErr = new Error('réponse sans observation');
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Insee Melodi : aucune réponse exploitable (${lastErr && lastErr.message})`);
}

export async function fetchSource(src, { today, fetchImpl, retryDelayMs } = {}) {
  if (src.kind === 'insee') return fetchInsee({ today, fetchImpl, retryDelayMs });
  return { url: src.url, data: await getJson(src.url, { fetchImpl, retryDelayMs }) };
}

// Dernière période réellement renseignée : « AAAA » (annuel) ou « AAAA-MM » (mensuel).
export function lastPeriod(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.observations)) {
    return data.observations.filter((o) => o.measures && o.measures.OBS_VALUE_NIVEAU && typeof o.measures.OBS_VALUE_NIVEAU.value === 'number' && o.dimensions && /^\d{4}-\d{2}$/.test(o.dimensions.TIME_PERIOD || '')).map((o) => o.dimensions.TIME_PERIOD).sort().pop() || null;
  }
  if (Array.isArray(data.id) && data.dimension && data.dimension.time && data.value && Array.isArray(data.size)) {
    const times = Object.keys(data.dimension.time.category.index);
    const ti = data.id.indexOf('time');
    const size = data.size[ti];
    const stride = data.size.slice(ti + 1).reduce((a, b) => a * b, 1);
    const filled = new Set();
    for (const k of Object.keys(data.value)) if (typeof data.value[k] === 'number') filled.add(Math.floor(Number(k) / stride) % size);
    const t = times.filter((_, i) => filled.has(i)).sort().pop() || null;
    if (t && data.dimension.month) {
      const mi = data.id.indexOf('month');
      const mSize = data.size[mi];
      const mStride = data.size.slice(mi + 1).reduce((a, b) => a * b, 1);
      const months = new Set();
      const tIdx = data.dimension.time.category.index[t];
      for (const k of Object.keys(data.value)) if (typeof data.value[k] === 'number' && Math.floor(Number(k) / stride) % size === tIdx) months.add(Math.floor(Number(k) / mStride) % mSize);
      const mKeys = Object.entries(data.dimension.month.category.index).filter(([, i]) => months.has(i)).map(([k]) => k).filter((k) => /^M\d{2}$/.test(k)).sort();
      return mKeys.length ? `${t}-${mKeys.pop().slice(1)}` : t;
    }
    return t;
  }
  return null;
}

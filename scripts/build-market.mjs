// Construit dist/market.json (bases de marché, profils saisonniers, contrôles, agrégats Émeraude)
// et dist/config.json (config + communes + sources), puis ajoute une ligne à l'historique.
import fs from 'node:fs';
import { readJson, readJsonIfExists, writeJson, p } from './lib/util.mjs';
import { validateSchema } from './lib/schema.mjs';
import { buildMeta, freshnessOf } from './lib/freshness.mjs';

const freshMetaOf = (x, now, config) => freshnessOf(x.period.end, now, config);
import { readIndicators } from './adapters/indicators.mjs';

const CORE = ['adr', 'occupancy', 'avgStay'];

// Fichier manuel d'origine d'une observation annuelle Ille & Vilaine Tourisme (registre data/raw/manifest.json).
function manifestFor(manifest, year) {
  return (manifest && manifest[`data/raw/adt35/epci_${year}.csv`]) || {};
}

// Comparaison des indicateurs départementaux d'une année récente avec la base de marché (contrôle, sans effet).
export function compareIndicators(indicators, markets) {
  const dep = markets['departement:35'];
  if (!dep) return [];
  const get = (name) => indicators.find((x) => x.indicator === name && x.territory.geoId === 'departement:35');
  const baseYear = dep.period.end.slice(0, 4);
  const rows = [];
  const occ = get('occupancy_pct');
  if (occ) rows.push({ id: 'dep_occupancy', comparable: true, base: { year: baseYear, value: dep.occupancy }, recent: { year: occ.period.end.slice(0, 4), value: occ.value / 100 }, gapPts: Math.round((occ.value / 100 - dep.occupancy) * 1000) / 10, decision: 'B — contrôle : même méthode, même niveau ; la base reste un millésime cohérent (prix et occupation de la même année)' });
  const stay = get('avg_stay_days');
  if (stay) rows.push({ id: 'dep_avgStay', comparable: true, base: { year: baseYear, value: dep.avgStay }, recent: { year: stay.period.end.slice(0, 4), value: stay.value }, gapPct: Math.round((stay.value / dep.avgStay - 1) * 1000) / 10, decision: 'B — contrôle' });
  const tjm = get('tjm_eur');
  if (tjm) rows.push({ id: 'dep_adr', comparable: false, base: { year: baseYear, value: dep.adr }, recent: { year: tjm.period.end.slice(0, 4), value: tjm.value }, gapPct: Math.round((tjm.value / dep.adr - 1) * 1000) / 10, decision: 'B — série révisée par la source (2024 publié à 104 € puis ≈ 140,6 €) : non comparable, non utilisée' });
  return rows;
}

export function normalizeProfile(occRaw, adrRaw, damping, days) {
  const sO = occRaw.reduce((s, v, i) => s + v * days[i], 0);
  const occupancyIndex = occRaw.map((v) => (v * 365) / sO);
  const meanA = adrRaw.reduce((a, b) => a + b, 0) / 12;
  let adrIndex = adrRaw.map((v) => 1 + damping * (v / meanA - 1));
  const w = occupancyIndex.map((o, i) => o * days[i]);
  const k = w.reduce((s, x) => s + x, 0) / w.reduce((s, x, i) => s + x * adrIndex[i], 0);
  adrIndex = adrIndex.map((a) => a * k);
  const r = (x) => Math.round(x * 10000) / 10000;
  return { occupancyIndex: occupancyIndex.map(r), adrIndex: adrIndex.map(r) };
}

function latestFullYear(obs, filter) {
  const byYear = new Map();
  for (const o of obs.filter(filter)) {
    if (o.status !== 'ok') continue;
    const y = o.period.start.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, Array(12).fill(null));
    byYear.get(y)[o.period.month] = o;
  }
  const years = [...byYear.keys()].filter((y) => byYear.get(y).every(Boolean)).sort();
  if (!years.length) return null;
  const y = years[years.length - 1];
  return { year: y, values: byYear.get(y).map((o) => o.value), obs: byYear.get(y) };
}

export function buildMarket({ observations, config, communes, sources, previous, aggregates, now = new Date(), buildId = 'local', manifest = null, indicators = [] }) {
  const notes = [];
  const markets = {};

  // 1. Bases annuelles (source principale : adt35_lighthouse).
  const annual = observations.filter((o) => o.source === 'adt35_lighthouse' && o.period.granularity === 'year');
  const byGeoYear = new Map();
  for (const o of annual) {
    const key = `${o.geo.level}:${o.geo.id}`;
    const y = o.period.start.slice(0, 4);
    const k = `${key}|${y}`;
    if (!byGeoYear.has(k)) byGeoYear.set(k, { key, year: y, label: o.geo.label, m: {} });
    byGeoYear.get(k).m[o.metric] = o;
  }
  const candidates = [...byGeoYear.values()].sort((a, b) => b.year.localeCompare(a.year));
  for (const c of candidates) {
    if (markets[c.key]) continue;
    const m = c.m;
    const prev = previous && previous.markets && previous.markets[c.key];
    const kept = CORE.some((k) => m[k] && m[k].status === 'kept_previous');
    const missing = CORE.some((k) => !m[k] || m[k].status === 'rejected');
    if (kept && prev) {
      markets[c.key] = { ...prev, status: 'ok', statusReason: 'Valeurs de la publication précédente conservées (variation jugée suspecte).' };
      notes.push(`${c.key} : valeurs précédentes conservées`);
      continue;
    }
    if (missing) {
      notes.push(`${c.key} (${c.year}) : métrique manquante ou rejetée, entrée ignorée`);
      continue;
    }
    const ref = m.adr;
    markets[c.key] = {
      label: c.label,
      geoLevel: c.key.split(':')[0],
      source: ref.source,
      period: { start: ref.period.start, end: ref.period.end },
      publishedAt: ref.publishedAt || '',
      adr: m.adr.value,
      occupancy: m.occupancy.value,
      avgStay: m.avgStay.value,
      occupancyYoyPts: m.occupancyYoyPts ? m.occupancyYoyPts.value : null,
      sample: { nightsBooked: m.nightsBooked ? m.nightsBooked.value : 0 },
      segmentedBy: [],
      definitions: ref.definitions || {},
      status: 'ok'
    };
    const mf = manifestFor(manifest, c.year);
    const src = sources.sources[ref.source] || {};
    markets[c.key].meta = buildMeta({
      source: ref.source,
      sourceUrl: mf.sourceUrl || src.document || src.url,
      publicationDate: mf.publicationDate || (ref.publishedAt || '').slice(0, 7),
      period: markets[c.key].period,
      retrievedAt: ref.retrievedAt,
      territory: c.label,
      methodology: mf.methodology || null,
      license: mf.license || src.licence,
      dataClass: 'OBSERVÉE',
      at: now,
      config
    });
  }

  // 2. Profils saisonniers.
  const days = config.months.referenceYearDays;
  const adtMonthlyOcc = latestFullYear(observations, (o) => o.source === 'adt35_lighthouse' && o.metric === 'occupancy' && o.period.granularity === 'month');
  const adtMonthlyAdr = latestFullYear(observations, (o) => o.source === 'adt35_lighthouse' && o.metric === 'adr' && o.period.granularity === 'month');
  const inseeHotels = latestFullYear(observations, (o) => o.source === 'insee_hotels' && o.metric === 'hotelOccupancy');
  const seasonality = {};
  for (const [id, pc] of Object.entries(config.seasonality.profiles)) {
    const occSrc = pc.occupancySource === 'insee_hotels' ? inseeHotels : adtMonthlyOcc;
    const occ = occSrc || adtMonthlyOcc;
    if (!occ || !adtMonthlyAdr) {
      notes.push(`Profil ${id} : données mensuelles insuffisantes, profil non publié (le moteur utilisera une répartition uniforme).`);
      continue;
    }
    const usedFallbackOcc = occ !== occSrc;
    const prof = normalizeProfile(occ.values, adtMonthlyAdr.values, pc.adrDamping, days);
    const occSourceId = usedFallbackOcc ? 'adt35_lighthouse' : pc.occupancySource;
    seasonality[id] = {
      label: pc.label,
      ...prof,
      basis: usedFallbackOcc ? `${pc.basis} (Repli : profil d'occupation des meublés départementaux, la source Insee étant indisponible.)` : pc.basis,
      period: `Occupation : ${occ.year} (${sources.sources[occSourceId].attribution}) · Prix : ${adtMonthlyAdr.year} (${sources.sources.adt35_lighthouse.attribution})`,
      sources: [...new Set([occSourceId, 'adt35_lighthouse'])]
    };
    // Les profils appliquent des séries départementales (ou hôtelières) à toutes les communes : PROXY, jamais une observation locale.
    const lastObs = (x) => x.obs[x.obs.length - 1];
    const occFirst = occ.obs[0];
    const adrFirst = adtMonthlyAdr.obs[0];
    seasonality[id].meta = {
      occupancy: buildMeta({
        source: occSourceId,
        sourceUrl: (sources.sources[occSourceId] || {}).url,
        publicationDate: occSourceId === 'adt35_lighthouse' ? manifestFor(manifest, '2024').publicationDate || null : null,
        period: { start: occFirst.period.start, end: lastObs(occ).period.end },
        retrievedAt: occFirst.retrievedAt,
        territory: 'Ille-et-Vilaine (département)',
        methodology: occSourceId === 'insee_hotels' ? 'Taux d\'occupation mensuel des hôtels utilisé comme forme de saisonnalité urbaine.' : 'Taux d\'occupation mensuel des meublés (logements entiers) du département.',
        license: (sources.sources[occSourceId] || {}).licence,
        dataClass: 'PROXY',
        at: now,
        config
      }),
      adr: buildMeta({
        source: 'adt35_lighthouse',
        sourceUrl: sources.sources.adt35_lighthouse.document,
        publicationDate: (adrFirst.publishedAt || '').slice(0, 7) || null,
        period: { start: adrFirst.period.start, end: lastObs(adtMonthlyAdr).period.end },
        retrievedAt: adrFirst.retrievedAt,
        territory: 'Ille-et-Vilaine (département)',
        methodology: `Prix mensuels des meublés du département, amortis (coefficient ${pc.adrDamping}).`,
        license: sources.sources.adt35_lighthouse.licence,
        dataClass: 'PROXY',
        at: now,
        config
      })
    };
  }

  // 3. Contrôles (Eurostat) — informatifs, sans effet sur le calcul.
  const controls = { checks: [] };
  const city = observations.filter((o) => o.source === 'eurostat_platforms' && o.geo.level === 'city' && o.status === 'ok');
  const cityYears = [...new Set(city.map((o) => o.period.start.slice(0, 4)))].sort();
  const cy = cityYears.filter((y) => city.some((o) => o.metric === 'stays' && o.period.start.startsWith(y)) && city.some((o) => o.metric === 'nightsBooked' && o.period.start.startsWith(y))).pop();
  if (cy) {
    const get = (metric, y) => (city.find((o) => o.metric === metric && o.period.start.startsWith(y)) || {}).value;
    const stays = get('stays', cy);
    const nights = get('nightsBooked', cy);
    const prevNights = get('nightsBooked', String(Number(cy) - 1));
    controls.eurostatRennes = { year: Number(cy), stays, nightsRented: nights, avgStay: Math.round((nights / stays) * 100) / 100, nightsYoyPct: prevNights ? Math.round((nights / prevNights - 1) * 1000) / 10 : null, source: 'Eurostat (tour_ce_oarc, Rennes)' };
    const anyCity = city.find((o) => o.period.start.startsWith(cy));
    controls.eurostatRennes.meta = buildMeta({
      source: 'eurostat_platforms',
      sourceUrl: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tour_ce_oarc?cities=FR016C&c_resid=TOTAL',
      publicationDate: null,
      period: { start: `${cy}-01-01`, end: `${cy}-12-31` },
      retrievedAt: anyCity && anyCity.retrievedAt,
      territory: 'Rennes (Eurostat, greater city)',
      methodology: 'Séjours et nuits louées via Airbnb, Booking, Expedia, Tripadvisor (toutes catégories d\'hébergement de courte durée).',
      license: sources.sources.eurostat_platforms.licence,
      dataClass: 'OBSERVÉE',
      at: now,
      config
    });
    const rm = markets['epci:rennes-metropole'];
    if (rm) {
      const gap = Math.abs(controls.eurostatRennes.avgStay / rm.avgStay - 1);
      controls.checks.push({ id: 'avgStay_rennes', status: gap <= 0.15 ? 'ok' : 'warning', detail: `Durée moyenne de séjour : Ille & Vilaine Tourisme ${rm.avgStay} nuits (${rm.period.start.slice(0, 4)}) vs Eurostat ${controls.eurostatRennes.avgStay} nuits (${cy}), écart ${(gap * 100).toFixed(0)} %.` });
    }
  } else {
    controls.checks.push({ id: 'avgStay_rennes', status: 'unavailable', detail: 'Données Eurostat Rennes indisponibles.' });
  }
  const regMonthly = latestFullYear(observations, (o) => o.source === 'eurostat_platforms' && o.geo.level === 'region' && o.metric === 'guestNights');
  if (regMonthly && seasonality.littoral) {
    const peakEu = regMonthly.values.indexOf(Math.max(...regMonthly.values));
    const peakLit = seasonality.littoral.occupancyIndex.indexOf(Math.max(...seasonality.littoral.occupancyIndex));
    controls.checks.push({ id: 'peak_month_littoral', status: peakEu === peakLit ? 'ok' : 'warning', detail: `Mois de pointe : Eurostat Bretagne ${config.months.labels[peakEu]} (${regMonthly.year}) vs profil littoral ${config.months.labels[peakLit]}.` });
  }

  // 3 bis. Indicateurs annuels récents (contrôle et tendance uniquement, jamais base de calcul).
  const byYear = {};
  for (const x of indicators) {
    const y = x.period.end.slice(0, 4);
    (byYear[y] = byYear[y] || []).push({ ...x, ...freshMetaOf(x, now, config) });
  }
  controls.indicatorComparisons = compareIndicators(indicators, markets);

  // 4. Agrégats Émeraude (jamais de données brutes).
  const minList = config.emeraude.minListingsToPublishAggregate;
  const segments = ((aggregates && aggregates.segments) || []).filter((s) => s.listings >= minList);

  return {
    market: {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      buildId,
      markets,
      seasonality,
      controls,
      emeraude: { segments },
      indicators: byYear,
      attribution: config.texts.attribution
    },
    notes
  };
}

if (process.argv[1].endsWith('build-market.mjs')) {
  const config = readJson('config/config.json');
  const communes = readJson('config/communes.json');
  const sources = readJson('config/sources.json');
  const { observations } = readJson('data/observations/observations.json');
  const previous = readJsonIfExists('dist/market.json');
  const aggregates = readJsonIfExists('data/emeraude/aggregates.json');
  const manifest = readJsonIfExists('data/raw/manifest.json');
  const { indicators, errors: indErrors } = readIndicators();
  if (indErrors.length) {
    console.error('Indicateurs annuels invalides :');
    indErrors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  const { market, notes } = buildMarket({ observations, config, communes, sources, previous, aggregates, buildId: process.env.GITHUB_SHA || 'local', manifest: manifest && manifest.files, indicators });
  const errors = validateSchema(market, readJson('schemas/market.schema.json'));
  if (errors.length) {
    console.error('market.json invalide :');
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  // Chaque commune doit pouvoir être résolue.
  const unresolved = communes.communes.filter((c) => !market.markets[`epci:${c.epci}`] && !communes.epci[c.epci].fallback.some((f) => market.markets[f]));
  if (unresolved.length) console.warn('Communes sans base directe ni repli :', unresolved.map((c) => c.label).join(', '));
  writeJson('dist/market.json', market);
  writeJson('dist/config.json', { schemaVersion: 1, generatedAt: market.generatedAt, config, communes, sources });
  const changes = [];
  if (previous) {
    for (const [k, v] of Object.entries(market.markets)) {
      const pv = previous.markets && previous.markets[k];
      if (!pv) changes.push(`+ ${k}`);
      else if (pv.adr !== v.adr || pv.occupancy !== v.occupancy || pv.period.end !== v.period.end) changes.push(`~ ${k}`);
    }
  }
  fs.appendFileSync(p('data/history/updates.jsonl'), JSON.stringify({ at: market.generatedAt, buildId: market.buildId, markets: Object.keys(market.markets).length, profiles: Object.keys(market.seasonality), changes, notes }) + '\n');
  console.log(`dist/market.json : ${Object.keys(market.markets).length} marchés, profils ${Object.keys(market.seasonality).join(', ') || 'aucun'}.`);
  notes.forEach((n) => console.log('  note : ' + n));
  market.controls.checks.forEach((c) => console.log(`  contrôle ${c.id} : ${c.status} — ${c.detail}`));
}

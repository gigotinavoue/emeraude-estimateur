// Adaptateur Eurostat (JSON-stat) : contrôles de cohérence et tendance de la demande.
import { readJsonIfExists } from '../lib/util.mjs';

const SOURCE = 'eurostat_platforms';

// Lecture d'une valeur JSON-stat à partir de coordonnées { dimension: code }.
export function jsonStatValue(j, coords) {
  let idx = 0;
  let mult = 1;
  for (let i = j.id.length - 1; i >= 0; i--) {
    const d = j.id[i];
    const keys = Object.keys(j.dimension[d].category.index);
    const k = coords[d] ?? keys[0];
    const pos = j.dimension[d].category.index[k];
    if (pos === undefined) return undefined;
    idx += pos * mult;
    mult *= j.size[i];
  }
  return j.value[idx] ?? j.value[String(idx)];
}

export function run() {
  return [...parseCity(readJsonIfExists('data/raw/eurostat/tour_ce_oarc_FR016C.json')), ...parseRegion(readJsonIfExists('data/raw/eurostat/tour_ce_omn12_FRH0.json'))];
}

// Rennes (annuel). `city` = fichier brut { retrievedAt, data } ; utilisable aussi sur une réponse candidate (contrôles avant acceptation).
export function parseCity(city) {
  const obs = [];
  if (city && city.data && city.data.id) {
    const j = city.data;
    const years = Object.keys(j.dimension.time.category.index);
    const metrics = { STY: ['stays', 'stays'], LSTY: ['nightsBooked', 'nights'], NGT_SP: ['guestNights', 'guest-nights'] };
    for (const y of years) {
      for (const [code, [metric, unit]] of Object.entries(metrics)) {
        const v = jsonStatValue(j, { time: y, indic_to: code });
        if (typeof v !== 'number') continue;
        obs.push({
          id: `${SOURCE}|${y}|city:FR016C|${metric}`, source: SOURCE,
          geo: { level: 'city', id: 'FR016C', label: 'Rennes (Eurostat, greater city)' },
          segment: { roomType: 'all', bedrooms: 'all' }, metric, value: v, unit,
          period: { start: `${y}-01-01`, end: `${y}-12-31`, granularity: 'year', month: null },
          retrievedAt: city.retrievedAt, status: 'ok'
        });
      }
    }
  }
  return obs;
}

// Bretagne (mensuel).
export function parseRegion(reg) {
  const obs = [];
  if (reg && reg.data && reg.data.id) {
    const j = reg.data;
    const years = Object.keys(j.dimension.time.category.index);
    for (const y of years) {
      for (let m = 0; m < 12; m++) {
        const code = `M${String(m + 1).padStart(2, '0')}`;
        const v = jsonStatValue(j, { time: y, month: code, indic_to: 'NGT_SP' });
        if (typeof v !== 'number') continue;
        const mm = String(m + 1).padStart(2, '0');
        const last = new Date(Date.UTC(Number(y), m + 1, 0)).getUTCDate();
        obs.push({
          id: `${SOURCE}|${y}-${mm}|region:FRH0|guestNights`, source: SOURCE,
          geo: { level: 'region', id: 'FRH0', label: 'Bretagne' },
          segment: { roomType: 'all', bedrooms: 'all' }, metric: 'guestNights', value: v, unit: 'guest-nights',
          period: { start: `${y}-${mm}-01`, end: `${y}-${mm}-${last}`, granularity: 'month', month: m },
          retrievedAt: reg.retrievedAt, status: 'ok'
        });
      }
    }
  }
  return obs;
}

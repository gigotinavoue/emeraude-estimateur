// Adaptateur Ille & Vilaine Tourisme (saisie manuelle annuelle des tableaux du bilan Lighthouse).
import fs from 'node:fs';
import { readCsv, readJson, p } from '../lib/util.mjs';

const SOURCE = 'adt35_lighthouse';

function num(s, field, file) {
  const n = Number(String(s).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${file} : valeur non numérique pour ${field} (« ${s} »)`);
  return n;
}

// Date de récupération RÉELLE du document (registre data/raw/manifest.json), pas l'heure du traitement.
function retrievedFor(manifest, f, fallback) {
  const m = manifest && manifest[`data/raw/adt35/${f}`];
  return (m && m.retrievedAt) || fallback;
}

export function run({ retrievedAt: processedAt }) {
  const sources = readJson('config/sources.json');
  const definitions = sources.sources[SOURCE].definitions;
  const files = fs.readdirSync(p('data/raw/adt35'));
  const manifest = fs.existsSync(p('data/raw/manifest.json')) ? readJson('data/raw/manifest.json').files : null;
  const obs = [];

  for (const f of files.filter((x) => /^epci_\d{4}\.csv$/.test(x))) {
    const retrievedAt = retrievedFor(manifest, f, processedAt);
    for (const row of readCsv(`data/raw/adt35/${f}`)) {
      const year = row.period_year;
      const [level, id] = row.geo_id.split(':');
      const geo = { level, id: level === 'departement' ? id : id, label: row.label };
      const period = { start: `${year}-01-01`, end: `${year}-12-31`, granularity: 'year', month: null };
      const common = { source: SOURCE, geo, segment: { roomType: 'entire_home', bedrooms: 'all' }, period, publishedAt: `${row.published}-01`, retrievedAt, definitions, status: 'ok' };
      const add = (metric, value, unit) => obs.push({ id: `${SOURCE}|${year}|${row.geo_id}|${metric}`, metric, value, unit, ...common });
      add('adr', num(row.adr_eur, 'adr_eur', f), 'EUR/night');
      add('occupancy', num(row.occupancy_pct, 'occupancy_pct', f) / 100, 'ratio');
      add('avgStay', num(row.avg_stay_nights, 'avg_stay_nights', f), 'nights');
      add('nightsBooked', num(row.nights_booked, 'nights_booked', f), 'nights');
      add('occupancyYoyPts', num(row.occupancy_yoy_pts, 'occupancy_yoy_pts', f), 'points');
    }
  }

  for (const f of files.filter((x) => /^departement_mensuel_\d{4}\.csv$/.test(x))) {
    const retrievedAt = retrievedFor(manifest, f, processedAt);
    for (const row of readCsv(`data/raw/adt35/${f}`)) {
      const year = row.period_year;
      const m = num(row.month, 'month', f) - 1;
      const mm = String(m + 1).padStart(2, '0');
      const last = new Date(Date.UTC(Number(year), m + 1, 0)).getUTCDate();
      const period = { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, '0')}`, granularity: 'month', month: m };
      const common = { source: SOURCE, geo: { level: 'departement', id: '35', label: 'Ille-et-Vilaine' }, segment: { roomType: 'entire_home', bedrooms: 'all' }, period, publishedAt: `${row.published}-01`, retrievedAt, definitions, status: 'ok' };
      const add = (metric, value, unit) => obs.push({ id: `${SOURCE}|${year}-${mm}|departement:35|${metric}`, metric, value, unit, ...common });
      add('occupancy', num(row.occupancy_pct, 'occupancy_pct', f) / 100, 'ratio');
      add('adr', num(row.adr_eur, 'adr_eur', f), 'EUR/night');
      add('revenueMonth', num(row.revenue_eur, 'revenue_eur', f), 'EUR/month/listing');
      add('nightsBooked', num(row.nights_booked, 'nights_booked', f), 'nights');
    }
  }
  return obs;
}

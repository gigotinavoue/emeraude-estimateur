// Adaptateur données Émeraude : lit UNIQUEMENT les agrégats anonymisés (data/emeraude/aggregates.json).
// Les données brutes (data/emeraude/private/) ne sont jamais lues par le pipeline public.
import { readJsonIfExists } from '../lib/util.mjs';

const SOURCE = 'emeraude_internal';

export function run({ retrievedAt }) {
  const agg = readJsonIfExists('data/emeraude/aggregates.json');
  if (!agg || !Array.isArray(agg.segments)) return [];
  const obs = [];
  for (const s of agg.segments) {
    const [geoKey, bedPart] = s.key.split('|');
    const [level, id] = geoKey.split(':');
    const bedrooms = bedPart.replace('bedrooms:', '');
    const period = { start: `${s.period.start}-01`, end: `${s.period.end}-28`, granularity: 'year', month: null };
    const base = { source: SOURCE, geo: { level, id }, segment: { roomType: 'entire_home', bedrooms }, period, retrievedAt, status: 'ok' };
    obs.push({ id: `${SOURCE}|${s.key}|ratioAdr`, metric: 'calibrationRatioAdr', value: s.ratioAdr, unit: 'ratio', ...base });
    obs.push({ id: `${SOURCE}|${s.key}|ratioOcc`, metric: 'calibrationRatioOcc', value: s.ratioOcc, unit: 'ratio', ...base });
    obs.push({ id: `${SOURCE}|${s.key}|listings`, metric: 'calibrationListings', value: s.listings, unit: `listings (${s.listingMonths} listing-months)`, ...base });
  }
  return obs;
}

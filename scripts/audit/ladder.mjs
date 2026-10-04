// Audit : échelle des tailles (studio → 4+ chambres, maison) pour une configuration donnée.
// Usage : node scripts/audit/ladder.mjs [chemin config] [commune]
import { readJson } from '../lib/util.mjs';
import { estimate } from '../../engine/index.js';

export const LADDER = [
  { id: 'studio', label: 'Studio 22 m², 2 voy.', type: 'studio', bedrooms: 0, bathrooms: 1, area: 22, guests: 2 },
  { id: 't2', label: 'T2 1 ch. 40 m², 2 voy.', type: 't2', bedrooms: 1, bathrooms: 1, area: 40, guests: 2 },
  { id: 't3', label: 'T3 2 ch. 60 m², 4 voy.', type: 't3', bedrooms: 2, bathrooms: 1, area: 60, guests: 4 },
  { id: 't4', label: 'T4 3 ch. 80 m², 6 voy.', type: 't4', bedrooms: 3, bathrooms: 1, area: 80, guests: 6 },
  { id: 't5', label: 'T5 4 ch. 110 m², 8 voy., 2 sdb', type: 't4', bedrooms: 4, bathrooms: 2, area: 110, guests: 8 },
  { id: 'maison3', label: 'Maison 3 ch. 95 m², 6 voy.', type: 'maison', bedrooms: 3, bathrooms: 1, area: 95, guests: 6 },
  { id: 'maison4', label: 'Maison 4 ch. 120 m², 8 voy., 2 sdb', type: 'maison', bedrooms: 4, bathrooms: 2, area: 120, guests: 8 }
];

export function runLadder(config, commune = 'rennes', market = readJson('dist/market.json'), extra = {}) {
  const ctx = { config, communes: readJson('config/communes.json'), sources: readJson('config/sources.json'), marketSources: [{ origin: 'remote', data: market }], today: new Date('2026-10-04') };
  return LADDER.map((l) => {
    const r = estimate({ commune, type: l.type, bedrooms: String(l.bedrooms), bathrooms: String(l.bathrooms), area: String(l.area), guests: String(l.guests), location: 'standard', amenities: [], monthsMode: 'count', monthsCount: '10', monthsSelected: [], commissionPct: '20', cleaningFee: '40', avgStay: '', vat: false, ...extra }, ctx);
    const s = r.scenarios.realiste;
    return { ...l, adr: s.adr, occ: s.occupancy, ca: s.nightsRevenue, owner: s.ownerIncome };
  });
}

if (process.argv[1].endsWith('ladder.mjs')) {
  const cfg = readJson(process.argv[2] || 'config/config.json');
  const rows = runLadder(cfg, process.argv[3] || 'rennes');
  const ref = rows.find((r) => r.id === 't2');
  console.log(`config ${cfg.version}`);
  for (const r of rows) console.log(`${r.label.padEnd(36)} ADR ${r.adr.toFixed(0).padStart(4)} € (×${(r.adr / ref.adr).toFixed(2)})  occ ${(r.occ * 100).toFixed(1)} %  CA ${Math.round(r.ca).toLocaleString('fr-FR').padStart(7)} € (×${(r.ca / ref.ca).toFixed(2)})`);
}

// Exemples de résultats avec incertitude et confiance (engine 1.2.0), données réelles au 04/10/2026,
// et avec des données « récentes » (simulation : date du 15/01/2026) pour montrer l'effet de la seule ancienneté.
import { readJson, writeText } from '../lib/util.mjs';
import { estimate } from '../../engine/index.js';

const NOW = new Date('2026-10-04T12:00:00Z');
const FRESH = new Date('2026-01-15T12:00:00Z');
const ctx = (today) => ({ config: readJson('config/config.json'), communes: readJson('config/communes.json'), sources: readJson('config/sources.json'), marketSources: [{ origin: 'remote', data: readJson('dist/market.json') }], today });
const base = { bathrooms: '1', location: 'standard', amenities: [], monthsMode: 'count', monthsCount: '10', monthsSelected: [], commissionPct: '20', cleaningFee: '40', avgStay: '', vat: false };
export const EXAMPLES = [
  ['Rennes · T2 40 m², 2 voy.', { commune: 'rennes', type: 't2', bedrooms: '1', area: '40', guests: '2' }],
  ['Rennes · T3 60 m², 4 voy.', { commune: 'rennes', type: 't3', bedrooms: '2', area: '60', guests: '4' }],
  ['Rennes · 3 ch. 80 m², 6 voy.', { commune: 'rennes', type: 't4', bedrooms: '3', area: '80', guests: '6' }],
  ['Rennes · T2 hypercentre rénové', { commune: 'rennes', type: 't2', bedrooms: '1', area: '45', guests: '2', location: 'hypercentre', amenities: ['renove', 'serrure-connectee'] }],
  ['Saint-Malo · T2 40 m², 2 voy.', { commune: 'saint-malo', type: 't2', bedrooms: '1', area: '40', guests: '2' }],
  ['Saint-Malo · 3 ch. 80 m², 6 voy.', { commune: 'saint-malo', type: 't4', bedrooms: '3', area: '80', guests: '6' }],
  ['Liffré · T2 40 m² (petit marché)', { commune: 'liffre', type: 't2', bedrooms: '1', area: '40', guests: '2' }],
  ['Betton · T2 40 m² (commune signalée)', { commune: 'betton', type: 't2', bedrooms: '1', area: '40', guests: '2' }],
  ['Rennes · T2 40 m² pour 6 voy. (capacité atypique)', { commune: 'rennes', type: 't2', bedrooms: '1', area: '40', guests: '6' }],
  ['Vitré · maison 4 ch. 160 m², 10 voy.', { commune: 'vitre', type: 'maison', bedrooms: '4', bathrooms: '2', area: '160', guests: '10' }]
];

const eur = (n) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
let md = '| Logement | Estimation centrale (CA des nuits) | Fourchette d\'incertitude | Incertitude | Confiance (données réelles) | Raisons | Confiance si données récentes |\n|---|---|---|---|---|---|---|\n';
for (const [label, over] of EXAMPLES) {
  const r = estimate({ ...base, ...over }, ctx(NOW));
  const f = estimate({ ...base, ...over }, ctx(FRESH));
  const s = r.summary;
  md += `| ${label} | ${eur(s.central)} | ${eur(s.low)} – ${eur(s.high)} | ±${s.uncertaintyPct} % | **${s.confidence}** | ${s.confidenceReasons.join(' ; ')} | ${f.summary.confidence} (±${f.summary.uncertaintyPct} %) |\n`;
}
writeText('reports/uncertainty-examples.md', md);
console.log(md);

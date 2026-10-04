// Phase 4 : comparaison à trois colonnes — ancien outil / V2 initiale (config archivée) / V2 calibrée (config actuelle).
// Produit reports/audit-calibration-data.json et reports/audit-calibration-tableaux.md.
import { readJson, writeJson, writeText } from '../lib/util.mjs';
import { estimate } from '../../engine/index.js';
import { legacyCalculate } from '../../legacy/legacy-engine.js';
import { toRaw, toLegacy } from '../../tests/helpers.mjs';
import { rentTable } from './rent-index.mjs';

const today = new Date('2026-10-04T12:00:00Z');
const communes = readJson('config/communes.json');
const sources = readJson('config/sources.json');
const market = readJson('dist/market.json');
const cfgV1 = readJson('config/history/config-2026-10-v1.json');
const cfgCal = readJson('config/config.json');
const fx = readJson('tests/fixtures/calibration-properties.json');

const run = (config, raw) => estimate(raw, { config, communes, sources, marketSources: [{ origin: 'remote', data: market }], today });
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')} %`;
const d = (a, b) => `${(b / a - 1) * 100 >= 0 ? '+' : ''}${((b / a - 1) * 100).toFixed(0)} %`;

function explain(v1, cal) {
  const out = [];
  const byId = (r) => Object.fromEntries(r.scenarios.realiste.adjustments.map((a) => [a.id, a]));
  const A = byId(v1);
  const B = byId(cal);
  if (B.reference) out.push(`recalage marché → 1 chambre ${B.reference.adrEffectPct.toFixed(0)} % prix, ${B.reference.occEffectPts >= 0 ? '+' : ''}${B.reference.occEffectPts.toFixed(1)} pt occupation`);
  for (const id of ['bedrooms', 'guests', 'bathrooms', 'house', 'area', 'location', 'amenities']) {
    const a = A[id] ? A[id].adrEffectPct : 0;
    const b = B[id] ? B[id].adrEffectPct : 0;
    const oa = A[id] ? A[id].occEffectPts : 0;
    const ob = B[id] ? B[id].occEffectPts : 0;
    if (Math.abs(a - b) > 0.05 || Math.abs(oa - ob) > 0.05) {
      const name = { bedrooms: 'courbe chambres', guests: 'capacité', bathrooms: 'salles de bain', house: 'bonus maison', area: 'surface', location: 'emplacement', amenities: 'équipements' }[id];
      out.push(`${name} ${a.toFixed(1)} → ${b.toFixed(1)} % prix${Math.abs(oa - ob) > 0.05 ? `, ${oa.toFixed(1)} → ${ob.toFixed(1)} pts occ.` : ''}`);
    }
  }
  return out.join(' ; ');
}

const rows = [];
for (const prop of fx.properties) {
  const L = legacyCalculate(toLegacy(prop, fx.defaults, cfgCal, communes));
  const raw = toRaw(prop, fx.defaults, cfgCal);
  const V1 = run(cfgV1, raw);
  const C = run(cfgCal, raw);
  if (!V1.ok || !C.ok) throw new Error(`${prop.id} : ${JSON.stringify(V1.errors || C.errors)}`);
  const a = V1.scenarios.realiste;
  const b = C.scenarios.realiste;
  rows.push({
    id: prop.id, label: prop.label, zone: C.data.zone, confidence: C.data.confidence.label,
    legacy: { adr: L.adr, occ: L.occ, ca: L.annual, owner: L.owner, commission: L.concierge },
    v2: { adr: a.adr, occ: a.occupancy, ca: a.nightsRevenue, owner: a.ownerIncome, commission: a.commission.amount },
    calibree: { adr: b.adr, occ: b.occupancy, ca: b.nightsRevenue, owner: b.ownerIncome, commission: b.commission.amount, prudent: C.scenarios.prudent.nightsRevenue, performant: C.scenarios.performant.nightsRevenue },
    explication: explain(V1, C)
  });
}

// Sensibilité (non appliquée) : indice communal tiré de la Carte des loyers, Rennes Métropole uniquement.
const rents = rentTable();
const rm = rents.filter((r) => r.epci === 'rennes-metropole');
const rennes = rm.find((r) => r.insee === '35238');
const others = rm.filter((r) => r.insee !== '35238');
const weighted = 0.75 * rennes.app12 + 0.25 * (others.reduce((s, r) => s + r.app12, 0) / others.length);
const sensitivity = rm.map((r) => ({ commune: r.commune, rentT1T2: r.app12, ratioToEpciWeighted: Math.round((r.app12 / weighted) * 1000) / 1000, factorElasticity05: Math.round(Math.pow(r.app12 / weighted, 0.5) * 1000) / 1000 }));

writeJson('reports/audit-calibration-data.json', { generatedAt: new Date().toISOString(), configs: { v2: cfgV1.version, calibree: cfgCal.version }, rows, rentSensitivity: { note: 'Non appliqué. Pondération Rennes = 3/4 des annonces de logements entiers de la métropole (AUDIAR 2024, données AirDNA citées) ; élasticité 0,5 hypothétique.', weightedRentT1T2: Math.round(weighted * 100) / 100, rows: sensitivity } });

let md = '| Logement | Zone | Prix/nuit : ancien → V2 → calibrée | Occupation : ancien → V2 → calibrée | CA nuits : ancien → V2 → calibrée (écart calibrée/V2) | Revenu propriétaire : ancien → V2 → calibrée | Fourchette calibrée (prudent – performant) | Explication V2 → calibrée |\n|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  md += `| ${r.label} | ${r.zone} | ${eur(r.legacy.adr)} → ${eur(r.v2.adr)} → **${eur(r.calibree.adr)}** | ${pct(r.legacy.occ)} → ${pct(r.v2.occ)} → **${pct(r.calibree.occ)}** | ${eur(r.legacy.ca)} → ${eur(r.v2.ca)} → **${eur(r.calibree.ca)}** (${d(r.v2.ca, r.calibree.ca)}) | ${eur(r.legacy.owner)} → ${eur(r.v2.owner)} → **${eur(r.calibree.owner)}** | ${eur(r.calibree.prudent)} – ${eur(r.calibree.performant)} | ${r.explication || 'aucun changement'} |\n`;
}
md += '\n**Sensibilité non appliquée — indice communal (Carte des loyers 2025, T1-T2, €/m²), Rennes Métropole**\n\n| Commune | Loyer T1-T2 €/m² | Rapport à la moyenne pondérée de l\'EPCI | Facteur si élasticité 0,5 |\n|---|---|---|---|\n';
for (const s of sensitivity) md += `| ${s.commune} | ${s.rentT1T2.toFixed(2).replace('.', ',')} | ${s.ratioToEpciWeighted.toFixed(3).replace('.', ',')} | ${s.factorElasticity05.toFixed(3).replace('.', ',')} |\n`;
writeText('reports/audit-calibration-tableaux.md', md);
console.log(md);
const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
console.log(`Écart moyen CA calibrée / V2 : ${((avg((r) => r.calibree.ca / r.v2.ca) - 1) * 100).toFixed(1)} % ; calibrée / ancien : ${((avg((r) => r.calibree.ca / r.legacy.ca) - 1) * 100).toFixed(1)} %`);

// Phase 2 : exécute l'ancien moteur (réplique exacte) et le nouveau moteur sur les mêmes logements fictifs.
// Produit reports/comparaison-ancien-nouveau.md, reports/comparaison.json et dist/compare.html.
// N'ajuste AUCUN coefficient : rapport uniquement.
import { readJson, writeJson, writeText } from './lib/util.mjs';
import { estimate } from '../engine/index.js';
import { legacyCalculate, LEGACY_MARKETS } from '../legacy/legacy-engine.js';
import { toRaw, toLegacy } from '../tests/helpers.mjs';

const config = readJson('config/config.json');
const communes = readJson('config/communes.json');
const sources = readJson('config/sources.json');
const market = readJson('dist/market.json');
const fx = readJson('tests/fixtures/properties.json');
const today = process.env.COMPARE_DATE ? new Date(process.env.COMPARE_DATE) : new Date();

const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')} %`;
const dpct = (a, b) => (a === 0 ? 'n/a' : `${((b / a - 1) * 100 >= 0 ? '+' : '')}${((b / a - 1) * 100).toFixed(0)} %`);
const dpts = (a, b) => `${(b - a) * 100 >= 0 ? '+' : ''}${((b - a) * 100).toFixed(1).replace('.', ',')} pts`;

const rows = [];
for (const prop of fx.properties) {
  const li = toLegacy(prop, fx.defaults, config, communes);
  const L = legacyCalculate(li);
  const N = estimate(toRaw(prop, fx.defaults, config), { config, communes, sources, marketSources: [{ origin: 'remote', data: market }], today });
  if (!N.ok) throw new Error(`${prop.id} : ${JSON.stringify(N.errors)}`);
  const n = N.scenarios.realiste;
  const lm = LEGACY_MARKETS[li.city];
  const reasons = [];
  reasons.push(`Base de marché : prix ${lm[0]} € → ${String(N.data.market.adr).replace('.', ',')} € (${dpct(lm[0], N.data.market.adr)}) ; occupation ${Math.round(lm[1] * 100)} % → ${Math.round(N.data.market.occupancy * 100)} % (${dpts(lm[1], N.data.market.occupancy)}) — ${N.data.zone}.`);
  const legacyMult = L.adr / lm[0];
  const newMult = n.adrAnnual / N.data.market.adr;
  reasons.push(`Ajustements de prix du logement : ×${legacyMult.toFixed(2).replace('.', ',')} (ancien) → ×${newMult.toFixed(2).replace('.', ',')} (nouveau).`);
  const legacyOccAdj = L.occ - lm[1];
  const newOccAdj = n.occupancyAnnual - N.data.market.occupancy;
  reasons.push(`Ajustements d'occupation : ${dpts(0, legacyOccAdj)} (ancien, plancher 40 % / plafond 88 %) → ${dpts(0, newOccAdj)} (nouveau).`);
  if (n.monthsMode === 'select') reasons.push(`Mois : sélection exacte (${n.monthsCount} mois) avec saisonnalité « ${N.data.seasonality.label} » ; l'ancien moteur ne connaît que le nombre de mois (${li.months}).`);
  else reasons.push(`Saisonnalité appliquée mois par mois (${N.data.seasonality.label}) ; en mode « nombre de mois », les mois retirés sont des mois moyens.`);
  rows.push({
    id: prop.id,
    label: prop.label,
    zone: N.data.zone,
    legacy: { adr: L.adr, occ: L.occ, nights: L.occupiedNights, ca: L.annual, airbnb: L.airbnb, commission: L.concierge, owner: L.owner, cleaning: L.cleaningCollected, low: L.low.ca, high: L.high.ca },
    nouveau: {
      adr: n.adr, occ: n.occupancy, nights: n.nightsBooked, ca: n.nightsRevenue, airbnb: n.airbnb.onNights, commission: n.commission.amount, owner: n.ownerIncome,
      cleaning: n.cleaning.collected, cleaningNetEmeraude: n.emeraude.cleaningNet, emeraudeTotal: n.emeraude.total,
      prudent: N.scenarios.prudent.nightsRevenue, performant: N.scenarios.performant.nightsRevenue
    },
    confidence: N.data.confidence.label,
    freshness: N.data.freshness.label,
    reasons
  });
}

const sorted = [...rows].sort((a, b) => Math.abs(b.nouveau.ca / b.legacy.ca - 1) - Math.abs(a.nouveau.ca / a.legacy.ca - 1));
const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;

let md = `# Comparaison ancien / nouveau moteur — scénario réaliste\n\n`;
md += `Date d'exécution : ${today.toISOString().slice(0, 10)} · moteur ${N_VERSION()} · configuration ${config.version} · données de marché générées le ${market.generatedAt.slice(0, 10)}.\n\n`;
md += `Hypothèses communes aux deux moteurs : commission 20 %, ménage 40 € par séjour, séjour moyen 3 nuits, TVA sur frais Airbnb non appliquée. Aucun coefficient n'a été modifié à la suite de cette comparaison.\n\n`;
md += `## Synthèse\n\n`;
md += `- CA des nuits : écart moyen ${dpct(1, avg((r) => r.nouveau.ca / r.legacy.ca))} (nouveau vs ancien).\n`;
md += `- Prix moyen par nuit : écart moyen ${dpct(1, avg((r) => r.nouveau.adr / r.legacy.adr))}.\n`;
md += `- Occupation : écart moyen ${dpts(0, avg((r) => r.nouveau.occ - r.legacy.occ))}.\n`;
md += `- Revenu propriétaire : écart moyen ${dpct(1, avg((r) => r.nouveau.owner / r.legacy.owner))}.\n\n`;
md += `## Tableau détaillé\n\n`;
md += `| Logement | Zone (nouveau) | Prix/nuit ancien → nouveau | Occupation ancien → nouveau | CA nuits ancien → nouveau | Revenu propriétaire ancien → nouveau | Commission Émeraude ancien → nouveau |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  md += `| ${r.label} | ${r.zone} | ${eur(r.legacy.adr)} → ${eur(r.nouveau.adr)} (${dpct(r.legacy.adr, r.nouveau.adr)}) | ${pct(r.legacy.occ)} → ${pct(r.nouveau.occ)} (${dpts(r.legacy.occ, r.nouveau.occ)}) | ${eur(r.legacy.ca)} → ${eur(r.nouveau.ca)} (${dpct(r.legacy.ca, r.nouveau.ca)}) | ${eur(r.legacy.owner)} → ${eur(r.nouveau.owner)} (${dpct(r.legacy.owner, r.nouveau.owner)}) | ${eur(r.legacy.commission)} → ${eur(r.nouveau.commission)} (${dpct(r.legacy.commission, r.nouveau.commission)}) |\n`;
}
md += `\n## Fourchettes\n\n| Logement | Ancien : prudent – optimisé | Nouveau : prudent – performant |\n|---|---|---|\n`;
for (const r of rows) md += `| ${r.label} | ${eur(r.legacy.low)} – ${eur(r.legacy.high)} | ${eur(r.nouveau.prudent)} – ${eur(r.nouveau.performant)} |\n`;
md += `\n## Ménage (séparé du CA des nuits)\n\n| Logement | Ménage collecté ancien → nouveau | Ménage net pour Émeraude (après 15,5 % Airbnb, D1) | Revenu Émeraude total (nouveau) |\n|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.label} | ${eur(r.legacy.cleaning)} → ${eur(r.nouveau.cleaning)} | ${eur(r.nouveau.cleaningNetEmeraude)} | ${eur(r.nouveau.emeraudeTotal)} |\n`;
md += `\n## Écarts les plus importants et leurs raisons\n\n`;
for (const r of sorted.slice(0, 8)) {
  md += `### ${r.label} — CA ${dpct(r.legacy.ca, r.nouveau.ca)}\n\n${r.reasons.map((x) => `- ${x}`).join('\n')}\n\n`;
}
writeText('reports/comparaison-ancien-nouveau.md', md);
writeJson('reports/comparaison.json', { generatedAt: new Date().toISOString(), today: today.toISOString(), rows });

// Page HTML simple de consultation (dist/compare.html).
const th = 'style="text-align:left;padding:8px;border-bottom:1px solid #d9e2de;font-size:12px;color:#66756f"';
const td = 'style="padding:8px;border-bottom:1px solid #eef2f0;font-size:13px;vertical-align:top"';
let html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparaison des moteurs</title></head><body style="margin:0;background:#f5f8f7;color:#17332c;font-family:Inter,system-ui,sans-serif"><main style="max-width:1160px;margin:auto;padding:24px 16px">`;
html += `<div style="color:#0b6b53;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Émeraude Conciergerie · test</div><h1 style="margin:6px 0">Comparaison ancien / nouveau moteur</h1><p style="color:#66756f;font-size:14px">Scénario réaliste. Commission 20 %, ménage 40 €, séjour 3 nuits. Aucun coefficient modifié suite à cette comparaison.</p>`;
html += `<div style="overflow-x:auto;background:#fff;border:1px solid #d9e2de;border-radius:18px"><table style="border-collapse:collapse;width:100%;min-width:900px"><thead><tr><th ${th}>Logement</th><th ${th}>Prix/nuit</th><th ${th}>Occupation</th><th ${th}>CA nuits</th><th ${th}>Propriétaire</th><th ${th}>Commission</th></tr></thead><tbody>`;
for (const r of rows) html += `<tr><td ${td}><b>${r.label}</b><br><span style="color:#66756f;font-size:12px">${r.zone} · confiance ${r.confidence}</span></td><td ${td}>${eur(r.legacy.adr)} → <b>${eur(r.nouveau.adr)}</b><br>${dpct(r.legacy.adr, r.nouveau.adr)}</td><td ${td}>${pct(r.legacy.occ)} → <b>${pct(r.nouveau.occ)}</b><br>${dpts(r.legacy.occ, r.nouveau.occ)}</td><td ${td}>${eur(r.legacy.ca)} → <b>${eur(r.nouveau.ca)}</b><br>${dpct(r.legacy.ca, r.nouveau.ca)}</td><td ${td}>${eur(r.legacy.owner)} → <b>${eur(r.nouveau.owner)}</b><br>${dpct(r.legacy.owner, r.nouveau.owner)}</td><td ${td}>${eur(r.legacy.commission)} → <b>${eur(r.nouveau.commission)}</b><br>${dpct(r.legacy.commission, r.nouveau.commission)}</td></tr>`;
html += `</tbody></table></div></main></body></html>`;
writeText('dist/compare.html', html);

console.log(md);

function N_VERSION() {
  return '1.0.0';
}

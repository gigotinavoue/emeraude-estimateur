// Phase 5 — validation des hypothèses et analyse de sensibilité.
// Toutes les variantes sont des VARIANTES DE CONFIGURATION : le moteur de production n'est pas modifié.
// Calculs déterministes (aucun tirage aléatoire). Entrées figées : tests/fixtures/market.valid.json,
// config/config.json, config/history/config-2026-10-v1.json, reports/audit-insee-pieces.json, reports/audit-structure-taille.json.
import { readJson, writeJson, writeText } from '../lib/util.mjs';
import { estimate } from '../../engine/index.js';
import { legacyCalculate } from '../../legacy/legacy-engine.js';
import { rentTable } from './rent-index.mjs';

export const TODAY = new Date('2026-10-04T12:00:00Z');
const clone = (x) => JSON.parse(JSON.stringify(x));
const KEYS = ['0', '1', '2', '3', '4+'];

// ---------------- Hypothèses testées ----------------
export const CURVES = {
  B_prudente: { label: 'B — prudente (proche V2 initiale)', adr: { 0: 0.85, 1: 1, 2: 1.30, 3: 1.60, 4: 1.90 } },
  A_actuelle: { label: 'A — actuelle (calibrée)', adr: { 0: 0.82, 1: 1, 2: 1.45, 3: 1.85, 4: 2.50 } },
  C_haute: { label: 'C — haute (borne Bordeaux)', adr: { 0: 0.82, 1: 1, 2: 1.50, 3: 2.00, 4: 2.80 } }
};

export const MIXES = {
  petits: { label: 'A — petits logements dominants', nightsShare: { 0: 0.15, 1: 0.60, 2: 0.18, 3: 0.05, 4: 0.02 }, listingShare: { 0: 0.14, 1: 0.58, 2: 0.19, 3: 0.06, 4: 0.03 } },
  lyon: { label: 'Lyon (urbain actuel)', nightsShare: { 0: 0.115, 1: 0.583, 2: 0.212, 3: 0.064, 4: 0.026 }, listingShare: { 0: 0.100, 1: 0.558, 2: 0.230, 3: 0.082, 4: 0.030 } },
  intermediaire: { label: 'B — intermédiaire (moyenne Lyon / Pays basque)', nightsShare: { 0: 0.087, 1: 0.513, 2: 0.252, 3: 0.096, 4: 0.053 }, listingShare: { 0: 0.073, 1: 0.463, 2: 0.255, 3: 0.127, 4: 0.083 } },
  bordeaux: { label: 'Bordeaux', nightsShare: { 0: 0.101, 1: 0.494, 2: 0.235, 3: 0.109, 4: 0.062 }, listingShare: { 0: 0.079, 1: 0.431, 2: 0.229, 3: 0.153, 4: 0.108 } },
  paysbasque: { label: 'Pays basque (littoral actuel)', nightsShare: { 0: 0.059, 1: 0.442, 2: 0.291, 3: 0.128, 4: 0.079 }, listingShare: { 0: 0.045, 1: 0.368, 2: 0.279, 3: 0.171, 4: 0.136 } },
  grands: { label: 'C — davantage de grands logements', nightsShare: { 0: 0.05, 1: 0.40, 2: 0.30, 3: 0.15, 4: 0.10 }, listingShare: { 0: 0.04, 1: 0.33, 2: 0.29, 3: 0.18, 4: 0.16 } }
};

const toKey = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === '4' ? '4+' : k, v]));

// Mélange « proxy local » : structure du parc Insee de la commune × (mélange location courte durée / parc Insee) observé dans les villes de référence.
// Correspondance pièces → chambres : 1 pièce = studio, 2 = 1 ch., 3 = 2 ch., 4 = 3 ch., 5+ = 4+ ch.
export function localProxyMix(insee, structure, commune, refs) {
  const rooms = (name) => {
    const s = insee.communes[name].roomsShareMain;
    return { '0': s.R1, '1': s.R2, '2': s.R3, '3': s.R4, '4+': s.R_GE5 };
  };
  const local = rooms(commune);
  const ratios = { nights: {}, listings: {} };
  for (const k of KEYS) {
    const rN = [];
    const rL = [];
    for (const { inseeName, iaCity } of refs) {
      const h = rooms(inseeName)[k];
      const b = structure.files[iaCity].bedrooms[k];
      if (h > 0) {
        rN.push(b.nightsShare / h);
        rL.push(b.listingShare / h);
      }
    }
    ratios.nights[k] = rN.reduce((a, b) => a + b, 0) / rN.length;
    ratios.listings[k] = rL.reduce((a, b) => a + b, 0) / rL.length;
  }
  const norm = (o) => {
    const s = Object.values(o).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v / s) * 1000) / 1000]));
  };
  return {
    nightsShare: norm(Object.fromEntries(KEYS.map((k) => [k, local[k] * ratios.nights[k]]))),
    listingShare: norm(Object.fromEntries(KEYS.map((k) => [k, local[k] * ratios.listings[k]])))
  };
}

// ---------------- Construction des variantes ----------------
export function variantConfig(base, { curve, mixUrbain, mixLittoral, refCal, perfPts, iaFree } = {}) {
  const c = clone(base);
  if (iaFree) {
    const v1 = readJson('config/history/config-2026-10-v1.json');
    for (const k of KEYS) {
      c.size.bedrooms[k].adr = v1.size.bedrooms[k].adr;
      c.size.bedrooms[k].occPts = v1.size.bedrooms[k].occPts;
      c.size.bedrooms[k].typicalGuests = v1.size.bedrooms[k].typicalGuests;
    }
    c.size.guests = clone(v1.size.guests);
    c.referenceCalibration.enabled = false;
  }
  if (curve) for (const k of KEYS) c.size.bedrooms[k].adr = curve[k === '4+' ? 4 : k];
  if (mixUrbain) c.referenceCalibration.mixByProfile.urbain = { label: mixUrbain.label, nightsShare: toKey(mixUrbain.nightsShare), listingShare: toKey(mixUrbain.listingShare) };
  if (mixLittoral) c.referenceCalibration.mixByProfile.littoral = { label: mixLittoral.label, nightsShare: toKey(mixLittoral.nightsShare), listingShare: toKey(mixLittoral.listingShare) };
  if (refCal === false) c.referenceCalibration.enabled = false;
  if (perfPts !== undefined) c.scenarios.occupancyDeltaPts = { ...c.scenarios.occupancyDeltaPts, min: perfPts, max: perfPts };
  return c;
}

export function referenceDivisor(config, profile) {
  const rc = config.referenceCalibration;
  if (!rc || !rc.enabled) return 1;
  const mix = rc.mixByProfile[profile];
  let a = 0;
  let n = 0;
  for (const k of KEYS) {
    a += (mix.nightsShare[k] || 0) * config.size.bedrooms[k].adr;
    n += mix.nightsShare[k] || 0;
  }
  return a / n;
}

// ---------------- Logements analysés ----------------
const P = (id, label, commune, type, bedrooms, area, guests, extra = {}) => ({ id, label, commune, type, bedrooms, area, guests, bathrooms: 1, location: 'standard', amenities: [], ...extra });
export const PROPERTIES = [
  P('rennes-studio', 'Rennes studio 22 m²', 'rennes', 'studio', 0, 22, 2),
  P('rennes-t2', 'Rennes T2 40 m²', 'rennes', 't2', 1, 40, 2),
  P('rennes-t3', 'Rennes T3 60 m²', 'rennes', 't3', 2, 60, 4),
  P('rennes-3ch', 'Rennes 3 ch. 80 m²', 'rennes', 't4', 3, 80, 6),
  P('saint-malo-studio', 'Saint-Malo studio 22 m²', 'saint-malo', 'studio', 0, 22, 2),
  P('saint-malo-t2', 'Saint-Malo T2 40 m²', 'saint-malo', 't2', 1, 40, 2),
  P('saint-malo-2ch', 'Saint-Malo 2 ch. 60 m²', 'saint-malo', 't3', 2, 60, 4),
  P('saint-malo-3ch', 'Saint-Malo 3 ch. 80 m²', 'saint-malo', 't4', 3, 80, 6),
  P('vitre-t2', 'Vitré T2 40 m²', 'vitre', 't2', 1, 40, 2),
  P('bruz-t2', 'Bruz T2 40 m²', 'bruz', 't2', 1, 40, 2),
  P('cesson-t2', 'Cesson-Sévigné T2 40 m²', 'cesson-sevigne', 't2', 1, 40, 2),
  P('pace-t2', 'Pacé T2 40 m²', 'pace', 't2', 1, 40, 2),
  P('betton-t2', 'Betton T2 40 m²', 'betton', 't2', 1, 40, 2),
  P('liffre-t2', 'Liffré T2 40 m²', 'liffre', 't2', 1, 40, 2),
  P('saint-aubin-t2', 'Saint-Aubin-du-Cormier T2 40 m²', 'saint-aubin-du-cormier', 't2', 1, 40, 2),
  P('val-d-ize-t2', 'Val-d\'Izé T2 40 m²', 'val-d-ize', 't2', 1, 40, 2),
  P('rm-maison-3ch', 'Rennes Métropole (Chantepie) maison 3 ch. 95 m²', 'chantepie', 'maison', 3, 95, 6, { amenities: ['terrasse'] })
];

export function runProperty(config, prop, market) {
  const raw = {
    commune: prop.commune, type: prop.type, bedrooms: String(prop.bedrooms), bathrooms: String(prop.bathrooms), area: String(prop.area), guests: String(prop.guests),
    location: prop.location, amenities: prop.amenities, monthsMode: 'count', monthsCount: '10', monthsSelected: [], commissionPct: '20', cleaningFee: '40', avgStay: '3', vat: false
  };
  const r = estimate(raw, { config, communes: readJson('config/communes.json'), sources: readJson('config/sources.json'), marketSources: [{ origin: 'remote', data: market }], today: TODAY });
  if (!r.ok) throw new Error(`${prop.id} : ${JSON.stringify(r.errors)}`);
  const s = r.scenarios.realiste;
  return { adr: s.adr, occ: s.occupancy, ca: s.nightsRevenue, owner: s.ownerIncome, prudent: r.scenarios.prudent.nightsRevenue, performant: r.scenarios.performant.nightsRevenue, performantOcc: r.scenarios.performant.occupancy };
}

export function legacyFor(prop, config, communes) {
  const label = communes.communes.find((c) => c.id === prop.commune).label;
  return legacyCalculate({ city: label, type: config.types[prop.type].label, bed: prop.bedrooms, bath: prop.bathrooms, area: prop.area, guest: prop.guests, months: 10, loc: 'Standard', commission: 20, cleaningFee: 40, stayLength: 3, eq: prop.amenities.map((id) => config.amenities.items.find((a) => a.id === id).legacyIndex) });
}

// ---------------- Analyses ----------------
export function runAll() {
  const base = readJson('config/config.json');
  const v1 = readJson('config/history/config-2026-10-v1.json');
  const market = readJson('tests/fixtures/market.valid.json');
  const communes = readJson('config/communes.json');
  const insee = readJson('reports/audit-insee-pieces.json');
  const structure = readJson('reports/audit-structure-taille.json');
  const byId = Object.fromEntries(PROPERTIES.map((p) => [p.id, p]));

  // Mélanges proxy locaux (Insee × ratios observés dans les villes de référence).
  const proxyRennes = localProxyMix(insee, structure, 'Rennes', [{ inseeName: 'Lyon (réf. urbaine)', iaCity: 'lyon' }, { inseeName: 'Bordeaux (réf.)', iaCity: 'bordeaux' }]);
  const proxyStMalo = localProxyMix(insee, structure, 'Saint-Malo', [{ inseeName: 'Biarritz (réf. littorale)', iaCity: 'paysbasque' }, { inseeName: 'Anglet (réf. littorale)', iaCity: 'paysbasque' }, { inseeName: 'Saint-Jean-de-Luz (réf. littorale)', iaCity: 'paysbasque' }]);
  const unkey = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k === '4+' ? 4 : k, v]));
  MIXES.proxyRennes = { label: 'Proxy local Rennes (parc Insee × ratios Lyon/Bordeaux)', nightsShare: unkey(proxyRennes.nightsShare), listingShare: unkey(proxyRennes.listingShare) };
  MIXES.proxyStMalo = { label: 'Proxy local Saint-Malo (parc Insee × ratios Pays basque)', nightsShare: unkey(proxyStMalo.nightsShare), listingShare: unkey(proxyStMalo.listingShare) };

  // 1. Courbes (le recalage suit la courbe : cohérence maintenue).
  const curveIds = ['rennes-studio', 'rennes-t2', 'rennes-t3', 'rennes-3ch', 'saint-malo-studio', 'saint-malo-t2', 'saint-malo-2ch', 'vitre-t2', 'betton-t2'];
  const curves = {};
  for (const [cid, c] of Object.entries(CURVES)) {
    const cfg = variantConfig(base, { curve: c.adr });
    curves[cid] = { label: c.label, divisorUrbain: referenceDivisor(cfg, 'urbain'), divisorLittoral: referenceDivisor(cfg, 'littoral'), rows: Object.fromEntries(curveIds.map((id) => [id, runProperty(cfg, byId[id], market)])) };
  }

  // 2–3. Mélanges de tailles, Rennes et Saint-Malo séparément (courbe actuelle).
  const mixRennes = {};
  for (const mid of ['petits', 'lyon', 'proxyRennes', 'intermediaire', 'bordeaux', 'grands']) {
    const cfg = variantConfig(base, { mixUrbain: MIXES[mid] });
    const ref = market.markets['epci:rennes-metropole'].adr / referenceDivisor(cfg, 'urbain');
    mixRennes[mid] = { label: MIXES[mid].label, refAdr1ch: ref, t2: runProperty(cfg, byId['rennes-t2'], market), t3: runProperty(cfg, byId['rennes-t3'], market) };
  }
  const mixStMalo = {};
  for (const mid of ['lyon', 'intermediaire', 'paysbasque', 'proxyStMalo', 'grands']) {
    const cfg = variantConfig(base, { mixLittoral: MIXES[mid] });
    const ref = market.markets['epci:saint-malo-agglomeration'].adr / referenceDivisor(cfg, 'littoral');
    mixStMalo[mid] = { label: MIXES[mid].label, refAdr1ch: ref, t2: runProperty(cfg, byId['saint-malo-t2'], market), t3: runProperty(cfg, byId['saint-malo-2ch'], market) };
  }

  // 5. Avec / sans Inside Airbnb. Variante supplémentaire : sans Inside Airbnb mais avec recalage, le mélange étant
  // la structure brute du parc Insee (aucune donnée Inside Airbnb).
  const iaFreeCfg = variantConfig(base, { iaFree: true });
  const inseeMix = (name) => {
    const s = insee.communes[name].roomsShareMain;
    const m = { 0: s.R1, 1: s.R2, 2: s.R3, 3: s.R4, 4: s.R_GE5 };
    return { label: `Parc Insee brut ${name}`, nightsShare: m, listingShare: m };
  };
  const iaFreeInseeCfg = variantConfig(variantConfig(base, { iaFree: true }), { mixUrbain: inseeMix('Rennes'), mixLittoral: inseeMix('Saint-Malo') });
  iaFreeInseeCfg.referenceCalibration.enabled = true;
  const inside = Object.fromEntries(PROPERTIES.map((p) => [p.id, { avec: runProperty(base, p, market), sans: runProperty(iaFreeCfg, p, market), sansAvecRecalageInsee: runProperty(iaFreeInseeCfg, p, market) }]));

  // 6. Performance : écart d'occupation du scénario performant.
  const perfIds = ['rennes-t2', 'rennes-t3', 'saint-malo-t2', 'vitre-t2'];
  const perf = {};
  for (const pts of [3, 5, 7, 10]) {
    const cfg = variantConfig(base, { perfPts: pts });
    perf[pts] = Object.fromEntries(perfIds.map((id) => [id, runProperty(cfg, byId[id], market)]));
  }

  // 7. Communes périphériques : biais potentiel de prix (non appliqué).
  const rents = rentTable().filter((r) => r.epci === 'rennes-metropole');
  const rennes = rents.find((r) => r.insee === '35238');
  const others = rents.filter((r) => r.insee !== '35238');
  const weighted = 0.75 * rennes.app12 + 0.25 * (others.reduce((s, r) => s + r.app12, 0) / others.length);
  const periphery = others.map((r) => {
    const ratio = r.app12 / weighted;
    const bias = (e) => Math.pow(ratio, e) - 1;
    const b05 = bias(0.5);
    return { commune: r.commune, rentT1T2: r.app12, ratio, bias03: bias(0.3), bias05: b05, bias07: bias(0.7), level: Math.abs(b05) < 0.03 ? 'faible' : Math.abs(b05) < 0.06 ? 'modéré' : 'significatif' };
  });

  // 8. Tableau global de robustesse.
  const plausibleMixes = { urbain: ['lyon', 'proxyRennes', 'bordeaux'], littoral: ['intermediaire', 'paysbasque', 'proxyStMalo'] };
  const profileOf = (c) => communes.communes.find((x) => x.id === c).profile;
  const global = PROPERTIES.map((p) => {
    const prof = profileOf(p.commune);
    const legacy = legacyFor(p, base, communes);
    const v2 = runProperty(v1, p, market);
    const cal = runProperty(base, p, market);
    const byCurve = Object.fromEntries(Object.entries(CURVES).map(([cid, c]) => [cid, runProperty(variantConfig(base, { curve: c.adr }), p, market)]));
    const structural = [];
    for (const c of Object.values(CURVES)) {
      for (const mid of plausibleMixes[prof]) {
        const cfg = variantConfig(base, prof === 'urbain' ? { curve: c.adr, mixUrbain: MIXES[mid] } : { curve: c.adr, mixLittoral: MIXES[mid] });
        structural.push(runProperty(cfg, p, market).ca);
      }
    }
    const sMin = Math.min(...structural);
    const sMax = Math.max(...structural);
    return {
      id: p.id, label: p.label, profile: prof,
      legacy: legacy.annual, v2: v2.ca, calibree: cal.ca, courbeB: byCurve.B_prudente.ca, courbeA: byCurve.A_actuelle.ca, courbeC: byCurve.C_haute.ca,
      structuralMin: sMin, structuralMax: sMax, structuralSpreadPct: (sMax - sMin) / cal.ca,
      prudent: cal.prudent, performant: cal.performant,
      displayLow: Math.min(cal.prudent, sMin), displayHigh: Math.max(cal.performant, sMax)
    };
  });

  return { proxyMixes: { rennes: proxyRennes, saintMalo: proxyStMalo }, curves, mixRennes, mixStMalo, inside, perf, periphery: { weightedRentT1T2: weighted, rows: periphery }, global };
}

// ---------------- Rapport (tableaux) ----------------
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')} %`;
const sp = (a, b) => `${(b / a - 1) * 100 >= 0 ? '+' : ''}${((b / a - 1) * 100).toFixed(1).replace('.', ',')} %`;

export function tables(res) {
  let md = '';
  md += '### T1 — Sensibilité à la courbe des chambres (prix / occupation / CA nuits ; variation vs courbe actuelle)\n\n| Logement | B — prudente | A — actuelle | C — haute | Amplitude B↔C |\n|---|---|---|---|---|\n';
  const ids = Object.keys(res.curves.A_actuelle.rows);
  const lab = Object.fromEntries(PROPERTIES.map((p) => [p.id, p.label]));
  for (const id of ids) {
    const a = res.curves.A_actuelle.rows[id];
    const cell = (x) => `${eur(x.adr)} / ${pct(x.occ)} / ${eur(x.ca)} (${sp(a.ca, x.ca)})`;
    const b = res.curves.B_prudente.rows[id];
    const c = res.curves.C_haute.rows[id];
    md += `| ${lab[id]} | ${cell(b)} | ${eur(a.adr)} / ${pct(a.occ)} / ${eur(a.ca)} | ${cell(c)} | ${pct(Math.abs(c.ca - b.ca) / a.ca)} |\n`;
  }
  md += `\nDiviseurs de recalage : B urbain ${res.curves.B_prudente.divisorUrbain.toFixed(3)} / littoral ${res.curves.B_prudente.divisorLittoral.toFixed(3)} ; A ${res.curves.A_actuelle.divisorUrbain.toFixed(3)} / ${res.curves.A_actuelle.divisorLittoral.toFixed(3)} ; C ${res.curves.C_haute.divisorUrbain.toFixed(3)} / ${res.curves.C_haute.divisorLittoral.toFixed(3)}.\n\n`;

  const mixTable = (title, m, base) => {
    let t = `### ${title}\n\n| Mélange | Prix de référence 1 ch. | T2 : prix / occ. / CA | T3 (2 ch.) : prix / occ. / CA |\n|---|---|---|---|\n`;
    const ref = m[base];
    for (const v of Object.values(m)) t += `| ${v.label} | ${eur(v.refAdr1ch)} | ${eur(v.t2.adr)} / ${pct(v.t2.occ)} / ${eur(v.t2.ca)} (${sp(ref.t2.ca, v.t2.ca)}) | ${eur(v.t3.adr)} / ${pct(v.t3.occ)} / ${eur(v.t3.ca)} (${sp(ref.t3.ca, v.t3.ca)}) |\n`;
    const t2 = Object.values(m).map((v) => v.t2.ca);
    const t3 = Object.values(m).map((v) => v.t3.ca);
    t += `\nAmplitude totale : T2 ${pct((Math.max(...t2) - Math.min(...t2)) / ref.t2.ca)}, T3 ${pct((Math.max(...t3) - Math.min(...t3)) / ref.t3.ca)} (par rapport au mélange actuel).\n\n`;
    return t;
  };
  md += mixTable('T2 — Mélange de tailles : Rennes (profil urbain)', res.mixRennes, 'lyon');
  md += mixTable('T3 — Mélange de tailles : Saint-Malo (profil littoral)', res.mixStMalo, 'paysbasque');

  md += '### T4 — Avec / sans calibration Inside Airbnb (CA nuits, scénario réaliste)\n\n| Logement | A. Avec (courbe A + recalage) | B. Sans (courbe V2 initiale, pas de recalage) | Écart B / A | B\'. Sans Inside Airbnb, recalage par le parc Insee brut | Écart B\' / A |\n|---|---|---|---|---|---|\n';
  for (const [id, v] of Object.entries(res.inside)) md += `| ${lab[id]} | ${eur(v.avec.ca)} (${eur(v.avec.adr)}, ${pct(v.avec.occ)}) | ${eur(v.sans.ca)} (${eur(v.sans.adr)}, ${pct(v.sans.occ)}) | ${sp(v.avec.ca, v.sans.ca)} | ${eur(v.sansAvecRecalageInsee.ca)} (${eur(v.sansAvecRecalageInsee.adr)}) | ${sp(v.avec.ca, v.sansAvecRecalageInsee.ca)} |\n`;

  md += '\n### T5 — Scénario « Performant » : écart d\'occupation testé (CA nuits ; prix +3 % de gestion dans tous les cas)\n\n| Logement | Réaliste | +3 pts | +5 pts | +7 pts | +10 pts (stress test) |\n|---|---|---|---|---|---|\n';
  for (const id of Object.keys(res.perf[3])) {
    const real = res.perf[3][id].ca;
    md += `| ${lab[id]} | ${eur(real)} | ${[3, 5, 7, 10].map((k) => `${eur(res.perf[k][id].performant)} (${sp(real, res.perf[k][id].performant)})`).join(' | ')} |\n`;
  }

  md += `\n### T6 — Communes périphériques de Rennes Métropole : biais de prix potentiel (non appliqué)\n\nMoyenne pondérée des loyers T1-T2 de l'EPCI (Rennes = 3/4 des annonces) : ${res.periphery.weightedRentT1T2.toFixed(2).replace('.', ',')} €/m².\n\n| Commune | Loyer T1-T2 €/m² | Rapport | Biais si élasticité 0,3 | 0,5 | 0,7 | Niveau (à 0,5) |\n|---|---|---|---|---|---|---|\n`;
  for (const r of res.periphery.rows) md += `| ${r.commune} | ${r.rentT1T2.toFixed(2).replace('.', ',')} | ${r.ratio.toFixed(3).replace('.', ',')} | ${pct(r.bias03)} | ${pct(r.bias05)} | ${pct(r.bias07)} | ${r.level} |\n`;

  md += '\n### T7 — Robustesse globale (CA nuits annuel, 10 mois, scénario réaliste sauf mention)\n\n| Logement | Ancien outil | V2 initiale | V2 calibrée | Courbe B | Courbe A | Courbe C | Incertitude structurelle (courbes × mélanges plausibles) | Prudent – Performant (calibrée) | Intervalle raisonnable à afficher |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const g of res.global) md += `| ${g.label} | ${eur(g.legacy)} | ${eur(g.v2)} | **${eur(g.calibree)}** | ${eur(g.courbeB)} | ${eur(g.courbeA)} | ${eur(g.courbeC)} | ${eur(g.structuralMin)} – ${eur(g.structuralMax)} (±${pct(g.structuralSpreadPct / 2)}) | ${eur(g.prudent)} – ${eur(g.performant)} | **${eur(g.displayLow)} – ${eur(g.displayHigh)}** |\n`;

  md += `\n### T8 — Mélanges « proxy local » calculés (Insee × ratios des villes de référence)\n\n| Mélange | Part des nuits studio / 1 / 2 / 3 / 4+ ch. | Part des annonces |\n|---|---|---|\n`;
  for (const [k, m] of Object.entries(res.proxyMixes)) md += `| ${k === 'rennes' ? 'Rennes' : 'Saint-Malo'} | ${KEYS.map((x) => m.nightsShare[x].toFixed(3).replace('.', ',')).join(' / ')} | ${KEYS.map((x) => m.listingShare[x].toFixed(3).replace('.', ',')).join(' / ')} |\n`;
  return md;
}

if (process.argv[1].endsWith('sensitivity.mjs')) {
  const res = runAll();
  writeJson('reports/validation-hypotheses-data.json', { generatedAt: new Date().toISOString(), today: TODAY.toISOString(), ...res });
  const md = tables(res);
  writeText('reports/validation-hypotheses-tableaux.md', md);
  console.log(md);
}

// Revue finale (lecture seule) du moteur 1.2.0. Aucune modification du moteur ni de la configuration.
import { readJson, writeJson, writeText } from '../lib/util.mjs';
import { estimate } from '../../engine/index.js';
import { legacyCalculate } from '../../legacy/legacy-engine.js';

export const NOW = new Date('2026-10-04T12:00:00Z');
const clone = (x) => JSON.parse(JSON.stringify(x));
const CFG = readJson('config/config.json');
const V1 = readJson('config/history/config-2026-10-v1.json');
const MARKET = readJson('dist/market.json');
const COMMUNES = readJson('config/communes.json');
const SOURCES = readJson('config/sources.json');
export const ESSENTIALS = CFG.amenities.items.filter((a) => a.group === 'base').map((a) => a.id);

export const ctx = (config = CFG, today = NOW, market = MARKET) => ({ config, communes: COMMUNES, sources: SOURCES, marketSources: [{ origin: 'remote', data: market }], today });
export const raw = (over = {}) => ({ commune: 'rennes', type: 't2', bedrooms: '1', bathrooms: '1', area: '40', guests: '2', location: 'standard', amenities: [], monthsMode: 'count', monthsCount: '10', monthsSelected: [], commissionPct: '20', cleaningFee: '40', avgStay: '', vat: false, ...over });
export const run = (over, config = CFG, today = NOW, market = MARKET) => {
  const r = estimate(raw(over), ctx(config, today, market));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};
export function shiftMarketYears(market, years) {
  const m = clone(market);
  for (const v of Object.values(m.markets)) {
    v.period = { start: `${Number(v.period.start.slice(0, 4)) + years}${v.period.start.slice(4)}`, end: `${Number(v.period.end.slice(0, 4)) + years}${v.period.end.slice(4)}` };
    if (v.publishedAt) v.publishedAt = `${Number(v.publishedAt.slice(0, 4)) + years}${v.publishedAt.slice(4)}`;
  }
  return m;
}

// 1. Décomposition T2 standard → T2 hypercentre rénové (cas des exemples 1.2.0).
export function decomposition() {
  const A = run({});
  const B = run({ area: '45', location: 'hypercentre', amenities: ['renove', 'serrure-connectee'] });
  const sa = A.scenarios.realiste;
  const sb = B.scenarios.realiste;
  const adj = (r, id) => r.scenarios.realiste.adjustments.find((x) => x.id === id) || { adrEffectPct: 0, occEffectPts: 0 };
  const rows = ['reference', 'bedrooms', 'area', 'guests', 'bathrooms', 'location', 'amenities'].map((id) => ({ id, a: adj(A, id), b: adj(B, id) }));
  return {
    marketSame: A.data.marketKey === B.data.marketKey && A.data.market.adr === B.data.market.adr,
    referenceSame: A.data.market.referenceAdr === B.data.market.referenceAdr,
    seasonalitySame: A.data.seasonality.id === B.data.seasonality.id,
    monthsSame: sa.monthsCount === sb.monthsCount && sa.nightsAvailable === sb.nightsAvailable,
    adr: { a: sa.adrAnnual, b: sb.adrAnnual, ratio: sb.adrAnnual / sa.adrAnnual },
    occ: { a: sa.occupancyAnnual, b: sb.occupancyAnnual, deltaPts: (sb.occupancyAnnual - sa.occupancyAnnual) * 100 },
    revenue: { a: sa.nightsRevenue, b: sb.nightsRevenue, ratio: sb.nightsRevenue / sa.nightsRevenue },
    predictedRatio: (1 + adj(B, 'location').adrEffectPct / 100) * (1 + adj(B, 'area').adrEffectPct / 100) * (1 + adj(B, 'amenities').adrEffectPct / 100) * (sb.occupancyAnnual / sa.occupancyAnnual),
    rows,
    summaries: { a: A.summary, b: B.summary }
  };
}

// 2. Logement de référence Émeraude (A ancien, B V2 initiale, C V2 calibrée, D 1.2.0).
export const REFERENCE = { location: 'hypercentre', amenities: [...ESSENTIALS, 'renove'] };
export function referenceCase() {
  const legacyEq = REFERENCE.amenities.map((id) => CFG.amenities.items.find((a) => a.id === id).legacyIndex);
  const L = legacyCalculate({ city: 'Rennes', type: 'T2', bed: 1, bath: 1, area: 40, guest: 2, months: 10, loc: 'Hypercentre', commission: 20, cleaningFee: 40, stayLength: 3, eq: legacyEq });
  const v1 = run(REFERENCE, V1).scenarios.realiste;
  const d = run(REFERENCE);
  const cfg110 = clone(CFG);
  delete cfg110.uncertainty; // 1.1.0 = même calcul, sans résumé d'incertitude
  const c = run(REFERENCE, cfg110).scenarios.realiste;
  const s = d.scenarios.realiste;
  const pack = (x) => ({ adr: x.adr, occ: x.occupancy, available: x.nightsAvailable, booked: x.nightsBooked, revenue: x.nightsRevenue, airbnb: x.airbnb.onNights, netBeforeCommission: x.nightsNetOfHostFee, commission: x.commission.amount, owner: x.ownerIncome, cleaning: x.cleaning.collected });
  return {
    A: { adr: L.adr, occ: L.occ, available: L.avail, booked: L.occupiedNights, revenue: L.annual, airbnb: L.airbnb, netBeforeCommission: L.netAfterAirbnb, commission: L.concierge, owner: L.owner, cleaning: L.cleaningCollected },
    B: pack(v1), C: pack(c), D: pack(s),
    summary: d.summary,
    fresh: run(REFERENCE, CFG, NOW, shiftMarketYears(MARKET, 1)).summary
  };
}

// 4. Confiance selon l'ancienneté des données (fin de période 31/12/2024).
export function freshnessTable(dates = ['2025-06-30', '2025-12-31', '2026-03-31', '2026-04-15', '2026-10-04', '2027-03-31', '2027-04-15']) {
  return dates.map((d) => {
    const r = run({}, CFG, new Date(`${d}T12:00:00Z`));
    return { date: d, months: r.data.freshness.months, freshness: r.data.freshness.level, confidence: r.summary.confidence, pct: r.summary.uncertaintyPct };
  });
}

// 5. Fourchettes.
export const RANGE_CASES = [
  ['Rennes T2 standard', {}],
  ['Rennes T2 hypercentre rénové', REFERENCE],
  ['Rennes T3', { type: 't3', bedrooms: '2', area: '60', guests: '4' }],
  ['Saint-Malo T2', { commune: 'saint-malo' }],
  ['Saint-Malo T3', { commune: 'saint-malo', type: 't3', bedrooms: '2', area: '60', guests: '4' }],
  ['Vitré T2', { commune: 'vitre' }],
  ['Bruz T2', { commune: 'bruz' }],
  ['Betton T2', { commune: 'betton' }]
];
export function ranges() {
  return RANGE_CASES.map(([label, over]) => {
    const now = run(over).summary;
    const fresh = run(over, CFG, NOW, shiftMarketYears(MARKET, 1)).summary;
    return { label, now, fresh };
  });
}

// 6. Chaîne des frais (cas de référence) et invariance du ménage.
export function feeChain() {
  const s = run(REFERENCE).scenarios.realiste;
  const s0 = run({ ...REFERENCE, cleaningFee: '0' }).scenarios.realiste;
  const s200 = run({ ...REFERENCE, cleaningFee: '200' }).scenarios.realiste;
  return {
    nightsRevenue: s.nightsRevenue, airbnbOnNights: s.airbnb.onNights, netBeforeCommission: s.nightsNetOfHostFee, commission: s.commission.amount, owner: s.ownerIncome,
    cleaningCollected: s.cleaning.collected, airbnbOnCleaning: s.airbnb.onCleaning, cleaningNetEmeraude: s.emeraude.cleaningNet, emeraudeTotal: s.emeraude.total,
    chainExact: Math.abs(s.nightsRevenue - s.airbnb.onNights - s.nightsNetOfHostFee) < 1e-9 && Math.abs(s.nightsNetOfHostFee - s.commission.amount - s.ownerIncome) < 1e-9,
    cleaningIndependent: [s0, s200].every((x) => x.nightsRevenue === s.nightsRevenue && x.ownerIncome === s.ownerIncome && x.commission.amount === s.commission.amount)
  };
}

// 7. Contrôles de cohérence.
export function coherence() {
  const R = (o) => run(o).scenarios;
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const q0 = R({}).realiste.nightsRevenue;
  const q1 = R({ amenities: ['lave-linge', 'lave-vaisselle'] }).realiste.nightsRevenue;
  const q2 = R({ amenities: ['lave-linge', 'lave-vaisselle', 'renove', 'literie-premium', 'climatisation'] }).realiste.nightsRevenue;
  add('Qualité croissante → revenu non décroissant', q0 <= q1 && q1 <= q2, `${Math.round(q0)} ≤ ${Math.round(q1)} ≤ ${Math.round(q2)}`);
  const t2 = R({}).realiste;
  const t3 = R({ type: 't3', bedrooms: '2', area: '60', guests: '4' }).realiste;
  add('T2 → T3 : prix par nuit en hausse', t3.adrAnnual > t2.adrAnnual, `${t2.adrAnnual.toFixed(1)} → ${t3.adrAnnual.toFixed(1)} € (×${(t3.adrAnnual / t2.adrAnnual).toFixed(2)})`);
  const caps = [2, 3, 4].map((g) => R({ guests: String(g) }).realiste.nightsRevenue);
  add('Capacité 2 → 3 → 4 (T2) : revenu non décroissant', caps[0] <= caps[1] && caps[1] <= caps[2], caps.map(Math.round).join(' ≤ '));
  const beds = [['studio', '0', '25', '2'], ['t2', '1', '40', '2'], ['t3', '2', '60', '4'], ['t4', '3', '80', '6'], ['t4', '4', '110', '8']].map(([type, b, a, g]) => R({ type, bedrooms: b, area: a, guests: g }).realiste);
  add('Chambres croissantes : prix et revenu croissants', beds.every((x, i) => i === 0 || (x.adrAnnual > beds[i - 1].adrAnnual && x.nightsRevenue > beds[i - 1].nightsRevenue)), beds.map((x) => Math.round(x.nightsRevenue)).join(' < '));
  const std = R({}).realiste.adrAnnual;
  const hyp = R({ location: 'hypercentre' }).realiste.adrAnnual;
  add('Standard → hypercentre : prix non décroissant', hyp >= std, `${std.toFixed(1)} → ${hyp.toFixed(1)} €`);
  const noR = R({}).realiste.adrAnnual;
  const ren = R({ amenities: ['renove'] }).realiste.adrAnnual;
  add('Ajout « rénové » : prix non décroissant', ren >= noR, `${noR.toFixed(1)} → ${ren.toFixed(1)} €`);
  const m12 = R({ monthsCount: '12' }).realiste;
  const m8 = R({ monthsCount: '8' }).realiste;
  add('Moins de mois (nombre) : CA en baisse, prix par nuit inchangé', m8.nightsRevenue < m12.nightsRevenue && Math.abs(m8.adr - m12.adr) < 1e-9, `CA ${Math.round(m12.nightsRevenue)} → ${Math.round(m8.nightsRevenue)} ; prix ${m12.adr.toFixed(2)} → ${m8.adr.toFixed(2)} €`);
  const sel = R({ monthsMode: 'select', monthsSelected: [0, 1, 2, 3, 4, 5, 8, 9, 10, 11] }).realiste;
  add('Mois choisis (sans juillet-août) : prix par nuit expliqué par la saisonnalité, pas par un artefact', Math.abs(sel.adr / m12.adr - 1) < 0.05, `prix ${m12.adr.toFixed(2)} → ${sel.adr.toFixed(2)} € (écart ${((sel.adr / m12.adr - 1) * 100).toFixed(1)} %)`);
  let orderOk = true;
  for (const [, over] of RANGE_CASES) {
    const s = R(over);
    if (!(s.prudent.nightsRevenue <= s.realiste.nightsRevenue && s.realiste.nightsRevenue <= s.performant.nightsRevenue)) orderOk = false;
  }
  add('Ordre prudent ≤ réaliste ≤ performant (8 logements)', orderOk, '');
  return checks;
}

if ((process.argv[1] || '').endsWith('final-review.mjs')) {
  const out = { decomposition: decomposition(), reference: referenceCase(), freshness: freshnessTable(), ranges: ranges(), fees: feeChain(), coherence: coherence() };
  writeJson('reports/revue-finale-data.json', { generatedAt: new Date().toISOString(), ...out });
  console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v), 1).slice(0, 12000));
}

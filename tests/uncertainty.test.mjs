// Tests de l'incertitude et du niveau de confiance (engine 1.2.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../engine/index.js';
import { roundTo, buildRange, getUncertainty, confidenceScore } from '../engine/uncertainty.js';
import { ctx, J, clone, baseRaw } from './helpers.mjs';

const CFG = J('config/config.json');
const FRESH = new Date('2026-01-15T12:00:00Z'); // 12,5 mois après la fin de la période 2024 → données « récentes »
const NOW = new Date('2026-10-04T12:00:00Z'); // situation réelle : 21 mois → données « anciennes »
const run = (over = {}, today = FRESH, c = ctx({ today })) => {
  const r = estimate(baseRaw(over), { ...c, today });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r;
};
const T3 = { type: 't3', bedrooms: '2', area: '60', guests: '4' };
const CH3 = { type: 't4', bedrooms: '3', area: '80', guests: '6' };

test('U1. Rennes T2 standard, données récentes → HIGH, ±7 %, raisons positives', () => {
  const s = run().summary;
  assert.equal(s.confidence, 'HIGH');
  assert.equal(s.uncertaintyPct, 7);
  assert.ok(s.confidenceReasons.includes('Marché urbain bien documenté'));
  assert.ok(s.confidenceReasons.includes('Typologie cohérente avec les données de calibration'));
});

test('U1b. Rennes T2 standard, données réelles (2024, 21 mois) → MEDIUM pour la seule ancienneté, ±7 %', () => {
  const s = run({}, NOW).summary;
  assert.equal(s.confidence, 'MEDIUM');
  assert.equal(s.uncertaintyPct, 7);
  assert.deepEqual(s.confidenceReasons, ['Données de marché datant de 21 mois (dernière publication disponible)']);
});

test('U2. Rennes T3 (2 chambres, typique) → HIGH, ±7 %', () => {
  const s = run(T3).summary;
  assert.equal(s.confidence, 'HIGH');
  assert.equal(s.uncertaintyPct, 7);
});

test('U3. Saint-Malo T2 → MEDIUM, ±12 % (données récentes comme actuelles)', () => {
  for (const today of [FRESH, NOW]) {
    const s = run({ commune: 'saint-malo' }, today).summary;
    assert.equal(s.confidence, 'MEDIUM');
    assert.equal(s.uncertaintyPct, 12);
    assert.ok(s.confidenceReasons.some((r) => r.includes('côtier')));
  }
});

test('U4. Saint-Malo 3 chambres → MEDIUM (données récentes) ou LOW (données actuelles), incertitude ≈ ±13 %', () => {
  const fresh = run({ commune: 'saint-malo', ...CH3 }).summary;
  assert.equal(fresh.confidence, 'MEDIUM');
  assert.equal(fresh.uncertaintyPct, 13);
  const now = run({ commune: 'saint-malo', ...CH3 }, NOW).summary;
  assert.equal(now.confidence, 'LOW');
  assert.ok(now.uncertaintyPct >= 12 && now.uncertaintyPct <= CFG.uncertainty.capPct);
});

test('U5. Petite commune (Liffré, 9 482 nuits) → MEDIUM ; le groupe « marché » est plafonné (ancienneté + petit marché ≠ LOW)', () => {
  const fresh = run({ commune: 'liffre' }).summary;
  assert.equal(fresh.confidence, 'MEDIUM');
  assert.equal(fresh.uncertaintyPct, 8);
  const now = run({ commune: 'liffre' }, NOW).summary;
  assert.equal(now.confidence, 'MEDIUM');
  assert.equal(now.model.confidenceGroupScores.market, CFG.uncertainty.groupCaps.market);
});

test('U6. Capacité très atypique (T2 pour 6 voyageurs) → baisse de confiance et incertitude ≥ 10 %', () => {
  const ref = run().summary;
  const s = run({ guests: '6' }).summary;
  assert.equal(ref.confidence, 'HIGH');
  assert.equal(s.confidence, 'MEDIUM');
  assert.ok(s.uncertaintyPct >= CFG.uncertainty.atypicalFloorPct);
  assert.ok(s.confidenceReasons.some((r) => r.includes('Capacité très inhabituelle')));
  assert.equal(run({ guests: '6' }, NOW).summary.confidence, 'LOW');
});

test('U7. Saisonnalité de repli → baisse de confiance et incertitude majorée', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  m.seasonality = {};
  const s = run({}, FRESH, ctx({ marketSources: [{ origin: 'remote', data: m }] })).summary;
  assert.equal(s.confidence, 'MEDIUM');
  assert.equal(s.uncertaintyPct, Math.round(Math.sqrt(7 ** 2 + CFG.uncertainty.components.seasonFallback ** 2)));
  assert.ok(s.confidenceReasons.some((r) => r.includes('saisonnier')));
});

test('U8. Facteurs multiples : pas de double comptage absurde (somme quadratique, maximum par groupe, plafond)', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  m.seasonality = {};
  for (const v of Object.values(m.markets)) v.period = { start: '2021-01-01', end: '2021-12-31' };
  const r = run({ commune: 'saint-malo', type: 'maison', bedrooms: '4', area: '330', guests: '14', bathrooms: '2' }, NOW, ctx({ marketSources: [{ origin: 'remote', data: m }] }));
  const s = r.summary;
  assert.equal(s.confidence, 'LOW');
  assert.ok(s.uncertaintyPct <= CFG.uncertainty.capPct);
  const linear = s.model.uncertaintyBasePct + s.model.uncertaintyComponents.reduce((a, c) => a + c.pct, 0);
  assert.ok(s.model.uncertaintyExactPct < linear, `${s.model.uncertaintyExactPct} doit être < somme linéaire ${linear}`);
  assert.ok(s.model.confidenceGroupScores.property <= CFG.uncertainty.groupCaps.property);
});

test('U8b. Plusieurs atypies du même logement comptent une seule fois dans la confiance', () => {
  const factors = [
    { id: 'large', group: 'property', weight: 1, componentPct: 5 },
    { id: 'capacity_atypical', group: 'property', weight: 1, componentPct: 4 },
    { id: 'area_atypical', group: 'property', weight: 1, componentPct: 3 }
  ];
  assert.equal(confidenceScore(factors, CFG).detail.property, 1);
  const u = getUncertainty(factors, 'urbain', CFG);
  assert.ok(u.pctExact < 7 + 5 + 4 + 3);
});

test('U9. Arrondi : 14 327 → 14 300 ; fourchette arrondie à la centaine', () => {
  assert.equal(roundTo(14327, 100), 14300);
  assert.equal(roundTo(14350, 100), 14400);
  const r = buildRange(14327, 7, 100);
  assert.deepEqual([r.central, r.low, r.high], [14300, 13300, 15300]);
  const s = run().summary;
  for (const v of [s.central, s.low, s.high, s.owner.central, s.owner.low, s.owner.high, ...Object.values(s.scenarios)]) assert.equal(v % 100, 0);
});

test('U10. Reproductibilité : mêmes saisies → sorties strictement identiques', () => {
  const inputs = [{}, T3, CH3, { commune: 'saint-malo' }, { commune: 'liffre', guests: '5' }, { commune: 'betton', location: 'central', amenities: ['renove'] }];
  for (const over of inputs) {
    const a = JSON.stringify(run(over, NOW));
    const b = JSON.stringify(run(over, NOW));
    assert.equal(a, b);
  }
});

test('U11. Fourchette cohérente et distincte des scénarios ; jamais présentée comme une garantie', () => {
  const r = run({ location: 'hypercentre', amenities: ['renove'] }, NOW);
  const s = r.summary;
  assert.ok(s.low <= s.central && s.central <= s.high);
  assert.equal(s.central, roundTo(r.scenarios.realiste.nightsRevenue, 100));
  assert.ok(Math.abs(s.model.exact.high / s.model.exact.central - 1 - s.uncertaintyPct / 100) < 1e-9);
  assert.match(s.notes.range, /non une garantie/);
  assert.match(s.notes.scenarios, /distincts de la fourchette/);
  assert.notEqual(s.low, s.scenarios.prudent);
});

test('U12. Logement atypique (3 chambres) : incertitude au moins égale au plancher de 10 %', () => {
  const s = run(CH3).summary;
  assert.equal(s.uncertaintyPct, CFG.uncertainty.atypicalFloorPct);
  assert.equal(s.confidence, 'MEDIUM');
});

test('U13. Commune périphérique signalée (Betton) → MEDIUM avec raison ; Cesson-Sévigné → HIGH', () => {
  const b = run({ commune: 'betton' }).summary;
  assert.equal(b.confidence, 'MEDIUM');
  assert.ok(b.confidenceReasons.some((r) => r.includes('loyers')));
  assert.equal(run({ commune: 'cesson-sevigne' }).summary.confidence, 'HIGH');
});

test('U14. Données départementales ou de secours → LOW quel que soit le reste (règle impérative)', () => {
  const m = clone(J('tests/fixtures/market.valid.json'));
  delete m.markets['epci:rennes-metropole'];
  assert.equal(run({}, FRESH, ctx({ marketSources: [{ origin: 'remote', data: m }] })).summary.confidence, 'LOW');
  const snap = J('tests/fixtures/market.valid.json');
  assert.equal(run({}, FRESH, ctx({ marketSources: [{ origin: 'remote', data: null, note: 'x' }, { origin: 'snapshot', data: snap }] })).summary.confidence, 'LOW');
});

test('U15. Compatibilité : une configuration antérieure sans section « uncertainty » fonctionne (pas de résumé, ancienne confiance)', () => {
  const v1 = J('config/history/config-2026-10-v1.json');
  const r = estimate(baseRaw(), { ...ctx(), config: v1, today: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.summary, undefined);
  assert.ok(['elevee', 'moyenne', 'faible'].includes(r.data.confidence.level));
});

test('U16. Correspondance avec la confiance historique (data.confidence) : HIGH→elevee, MEDIUM→moyenne, LOW→faible', () => {
  const map = { HIGH: 'elevee', MEDIUM: 'moyenne', LOW: 'faible' };
  for (const [over, today] of [[{}, FRESH], [{}, NOW], [{ commune: 'saint-malo', ...CH3 }, NOW]]) {
    const r = run(over, today);
    assert.equal(r.data.confidence.level, map[r.summary.confidence]);
  }
});

// Tests de la phase 5 : reproductibilité et cohérence des analyses de sensibilité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll, variantConfig, referenceDivisor, CURVES, MIXES, PROPERTIES, runProperty } from '../scripts/audit/sensitivity.mjs';
import { validateSchema } from '../scripts/lib/schema.mjs';
import { J } from './helpers.mjs';

const BASE = J('config/config.json');
const MARKET = J('tests/fixtures/market.valid.json');
const KEYS = ['0', '1', '2', '3', '4+'];
const byId = Object.fromEntries(PROPERTIES.map((p) => [p.id, p]));
let RES = null;
const res = () => (RES ??= runAll());

test('S1. Analyses déterministes : deux exécutions donnent exactement le même résultat', () => {
  const a = JSON.stringify(runAll());
  const b = JSON.stringify(runAll());
  assert.equal(a, b);
});

test('S2. Toutes les variantes de configuration restent conformes au schéma', () => {
  const schema = J('schemas/config.schema.json');
  const variants = [
    ...Object.values(CURVES).map((c) => variantConfig(BASE, { curve: c.adr })),
    ...Object.values(MIXES).map((m) => variantConfig(BASE, { mixUrbain: m, mixLittoral: m })),
    variantConfig(BASE, { iaFree: true }),
    ...[3, 5, 7, 10].map((x) => variantConfig(BASE, { perfPts: x }))
  ];
  for (const v of variants) assert.deepEqual(validateSchema(v, schema), []);
});

test('S3. Chaque mélange testé conserve la cohérence avec la moyenne de marché (recalage)', () => {
  res(); // calcule aussi les mélanges proxy locaux
  for (const [mid, mix] of Object.entries(MIXES)) {
    const cfg = variantConfig(BASE, { mixUrbain: mix });
    const div = referenceDivisor(cfg, 'urbain');
    let a = 0; let n = 0;
    for (const k of KEYS) {
      const key = k === '4+' ? 4 : k;
      a += mix.nightsShare[key] * cfg.size.bedrooms[k].adr;
      n += mix.nightsShare[key];
    }
    assert.ok(Math.abs(div - a / n) < 1e-9, mid);
    assert.ok(div > 1 && div < 1.6, `${mid} : diviseur ${div}`);
  }
});

test('S4. Variante sans Inside Airbnb : aucun paramètre issu d\'Inside Airbnb (courbe V2 initiale, pas de recalage)', () => {
  const v1 = J('config/history/config-2026-10-v1.json');
  const cfg = variantConfig(BASE, { iaFree: true });
  assert.equal(cfg.referenceCalibration.enabled, false);
  for (const k of KEYS) {
    assert.equal(cfg.size.bedrooms[k].adr, v1.size.bedrooms[k].adr);
    assert.equal(cfg.size.bedrooms[k].typicalGuests, v1.size.bedrooms[k].typicalGuests);
  }
  assert.deepEqual(cfg.size.guests, v1.size.guests);
});

test('S5. Courbes testées : prix croissants avec la taille ; B ≤ A ≤ C sur les 3 chambres', () => {
  for (const c of Object.values(CURVES)) {
    const vals = KEYS.map((k) => c.adr[k === '4+' ? 4 : k]);
    for (let i = 1; i < vals.length; i++) assert.ok(vals[i] > vals[i - 1]);
  }
  const r = res().curves;
  assert.ok(r.B_prudente.rows['rennes-3ch'].ca <= r.A_actuelle.rows['rennes-3ch'].ca);
  assert.ok(r.A_actuelle.rows['rennes-3ch'].ca <= r.C_haute.rows['rennes-3ch'].ca);
});

test('S6. Scénario performant : CA croissant avec l\'écart testé (+3 < +5 < +7 < +10), réaliste inchangé', () => {
  const p = res().perf;
  for (const id of Object.keys(p[3])) {
    assert.ok(p[3][id].performant < p[5][id].performant && p[5][id].performant < p[7][id].performant && p[7][id].performant < p[10][id].performant, id);
    assert.equal(p[3][id].ca, p[10][id].ca);
  }
});

test('S7. Mélanges proxy locaux : parts positives dont la somme vaut 1', () => {
  for (const m of Object.values(res().proxyMixes)) {
    for (const shares of [m.nightsShare, m.listingShare]) {
      const s = Object.values(shares).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(s - 1) < 0.003, `somme ${s}`);
      assert.ok(Object.values(shares).every((x) => x >= 0));
    }
  }
});

test('S8. Communes périphériques : biais potentiel toujours à la baisse, classement reproductible', () => {
  const rows = res().periphery.rows;
  assert.equal(rows.length, 9);
  assert.ok(rows.every((r) => r.bias03 <= 0 && r.bias05 <= r.bias03 && r.bias07 <= r.bias05));
  assert.equal(rows.find((r) => r.commune === 'Betton').level, 'significatif');
  assert.ok(rows.filter((r) => r.level === 'faible').length + rows.filter((r) => r.level === 'modéré').length + rows.filter((r) => r.level === 'significatif').length === 9);
});

test('S9. Tableau global : l\'estimation calibrée est toujours à l\'intérieur de l\'intervalle affiché et de l\'incertitude structurelle', () => {
  for (const g of res().global) {
    assert.ok(g.displayLow <= g.calibree && g.calibree <= g.displayHigh, g.id);
    assert.ok(g.structuralMin <= g.calibree + 1e-6 && g.calibree <= g.structuralMax + 1e-6, g.id);
    assert.ok(g.structuralSpreadPct < 0.35, `${g.id} : incertitude structurelle ${g.structuralSpreadPct}`);
  }
});

test('S10. Le moteur de production n\'est pas modifié par l\'analyse (configuration actuelle = référence A)', () => {
  const a = runProperty(BASE, byId['rennes-t2'], MARKET);
  const b = res().curves.A_actuelle.rows['rennes-t2'];
  assert.equal(a.ca, b.ca);
});

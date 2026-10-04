// Revue finale (moteur 1.2.0) : propriétés vérifiées avant toute migration. Aucune modification du moteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decomposition, referenceCase, freshnessTable, ranges, feeChain, coherence } from '../scripts/audit/final-review.mjs';
import { J } from './helpers.mjs';

const CFG = J('config/config.json');

test('R1. T2 standard → hypercentre rénové : écart entièrement expliqué par emplacement, surface et équipements (aucun effet caché)', () => {
  const d = decomposition();
  assert.ok(d.marketSame && d.referenceSame && d.seasonalitySame && d.monthsSame);
  assert.ok(Math.abs(d.revenue.ratio - d.predictedRatio) < 1e-9, `${d.revenue.ratio} vs ${d.predictedRatio}`);
  assert.ok(Math.abs(d.occ.deltaPts - 5) < 1e-9);
});

test('R2. Logement de référence : V2 calibrée et 1.2.0 identiques sur les montants ; 1.2.0 ajoute seulement fourchette et confiance', () => {
  const r = referenceCase();
  for (const k of Object.keys(r.C)) assert.equal(r.C[k], r.D[k], k);
  assert.equal(r.summary.central, Math.round(r.D.revenue / 100) * 100);
  assert.equal(r.fresh.confidence, 'HIGH');
});

test('R3. HIGH est atteignable : vert jusqu\'à 15 mois après la fin de la période, orange jusqu\'à 27 mois, rouge au-delà (LOW)', () => {
  const t = freshnessTable();
  for (const row of t) {
    const expected = row.freshness === 'green' ? 'HIGH' : row.freshness === 'orange' ? 'MEDIUM' : 'LOW';
    assert.equal(row.confidence, expected, row.date);
  }
  // Dates dérivées du millésime actif (le test reste valable après une actualisation de la base).
  const end = J('dist/market.json').markets['epci:rennes-metropole'].period.end;
  const y = Number(end.slice(0, 4));
  const t2 = freshnessTable([`${y + 1}-03-31`, `${y + 2}-03-31`, `${y + 2}-04-15`, `${y + 3}-04-15`]);
  assert.equal(t2.find((x) => x.date === `${y + 1}-03-31`).confidence, 'HIGH');
  assert.equal(t2.find((x) => x.date === `${y + 2}-03-31`).confidence, 'HIGH');
  assert.equal(t2.find((x) => x.date === `${y + 2}-04-15`).confidence, 'MEDIUM');
  assert.equal(t2.find((x) => x.date === `${y + 3}-04-15`).confidence, 'LOW');
});

test('R4. Fourchettes : bornes positives, largeur bornée, logements plus incertains plus larges', () => {
  const rs = ranges();
  const by = Object.fromEntries(rs.map((r) => [r.label, r.now]));
  for (const r of rs) {
    assert.ok(r.now.low > 0 && r.now.low <= r.now.central && r.now.central <= r.now.high, r.label);
    assert.ok((r.now.high - r.now.low) / r.now.central <= (2 * CFG.uncertainty.capPct) / 100 + 0.01, r.label);
  }
  assert.ok(by['Saint-Malo T2'].uncertaintyPct > by['Rennes T2 standard'].uncertaintyPct);
  for (const l of ['Vitré T2', 'Bruz T2', 'Betton T2']) assert.ok(by[l].uncertaintyPct >= by['Rennes T2 standard'].uncertaintyPct, l);
});

test('R5. Chaîne des frais exacte et ménage sans effet sur nuits, commission et revenu propriétaire', () => {
  const f = feeChain();
  assert.ok(f.chainExact);
  assert.ok(f.cleaningIndependent);
  assert.ok(Math.abs(f.cleaningNetEmeraude - (f.cleaningCollected - f.airbnbOnCleaning)) < 1e-9);
});

test('R6. Contrôles de cohérence de la revue finale : tous satisfaits', () => {
  for (const c of coherence()) assert.ok(c.ok, `${c.name} — ${c.detail}`);
});

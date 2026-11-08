// Forfait ménage indicatif : grille, plafonds, indépendance vis-à-vis des calculs financiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { estimerForfaitMenage as f } from '../scripts/lib/forfait-menage.js';
import { computeFinancials } from '../engine/core.js';

const G = JSON.parse(fs.readFileSync('config/forfait-menage.json', 'utf8'));
const CFG = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));
const apt = (bedrooms, area, guests, bathrooms = 1) => f({ isHouse: false, bedrooms, area, guests, bathrooms }, G);
const maison = (area, bathrooms, bedrooms = 3, guests = 6) => f({ isHouse: true, bedrooms, area, guests, bathrooms }, G);

test('FM1. Bases de la grille validée', () => {
  assert.deepEqual([apt(0, 25, 2), apt(1, 40, 2), apt(2, 60, 4), apt(3, 80, 6)], [35, 45, 60, 80]);
  assert.deepEqual([maison(85, 1), maison(120, 2), maison(180, 2), maison(230, 2)], [90, 110, 140, 170]);
});

test('FM2. Suppléments et plafonds', () => {
  assert.equal(apt(0, 40, 2), 40);
  assert.equal(apt(1, 45, 4), 50);
  assert.equal(apt(2, 80, 6, 2), 75);
  assert.equal(apt(1, 500, 2), 60, 'surface plafonnée à +15 €');
  assert.equal(apt(4, 110, 8, 2), 100, 'suppléments plafonnés à +20 €');
  assert.equal(maison(180, 5), 155);
  assert.equal(maison(300, 8), 170, 'plafond automatique des maisons');
});

test('FM3. Limites de surface des maisons', () => {
  assert.deepEqual([maison(99.5, 1), maison(100, 2), maison(150, 2), maison(150.5, 2), maison(200, 2), maison(200.5, 2)], [90, 110, 110, 140, 140, 170]);
});

test('FM4. Saisies particulières', () => {
  assert.equal(apt(1, 40, 2, 1.5), 45, 'salle de bain décimale arrondie à l\'inférieur');
  assert.equal(apt(1, 40, 2, 0), 45);
  assert.equal(f({ isHouse: false, bedrooms: '1', area: '40,0', guests: ' 2', bathrooms: '1' }, G), 45);
  assert.equal(f({ isHouse: false, bedrooms: '', area: '40', guests: '2', bathrooms: '1' }, G), null);
});

test('FM5. La grille ne contient ni marge, ni coût prestataire, ni linge', () => {
  const brut = JSON.stringify({ ...G, aide: '' }).toLowerCase();
  for (const mot of ['marge', 'prestataire', 'linge', 'consommable']) assert.ok(!brut.includes(mot), mot);
});

test('FM6. Le forfait n\'agit sur les flux que comme frais de ménage : conservation et CA des nuits', () => {
  const nuits = { nightsRevenue: 10000, nightsBooked: 150, monthsCount: 10 };
  const a = computeFinancials(nuits, { cleaningFee: 40, commissionPct: 20 }, 3, CFG);
  const b = computeFinancials(nuits, { cleaningFee: 45, commissionPct: 20 }, 3, CFG);
  assert.equal(a.nightsRevenue, b.nightsRevenue);
  const c = b.cleaning.collected;
  assert.ok(Math.abs(10000 + c - (b.airbnb.onNights + b.airbnb.onCleaning + b.commission.amount + c + b.ownerIncome)) < 1e-6);
  assert.ok(Math.abs((b.ownerIncome - a.ownerIncome) + 50 * 5 * (0.155 + 0.2 * 0.845)) < 1e-6);
});

test('FM7. Artifact : grille embarquée, phrase validée, tuile en double absente', () => {
  const h = fs.readFileSync('dist/estimateur-artifact.html', 'utf8');
  const snap = JSON.parse(/const SNAPSHOT=(\{.*\});\r?\nconst REMOTE/.exec(h)[1]);
  assert.deepEqual(snap.forfaitMenage, G);
  assert.ok(h.includes("Ce montant n'est pas un revenu : ses frais Airbnb et la commission associée sont déduits du revenu propriétaire."));
  assert.ok(!h.includes('Frais Airbnb sur le ménage (propriétaire)'));
  assert.ok(h.includes('<span>Frais Airbnb sur le ménage (charge propriétaire)</span>'), 'première tuile conservée');
});

// Tests de double comptage et d'estimations aberrantes (phase 4 — calibration).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../engine/index.js';
import { ctx, J, baseRaw } from './helpers.mjs';

const CFG = J('config/config.json');
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);
const R = (raw, c = ctx()) => {
  const r = estimate(raw, c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r;
};
const CLASSES = ['0', '1', '2', '3', '4+'];
const typical = (k) => {
  const b = CFG.size.bedrooms[k];
  return { bedrooms: k === '4+' ? '4' : k, area: String(b.typicalArea), guests: String(b.typicalGuests), bathrooms: String(b.typicalBathrooms ?? 1), type: { 0: 'studio', 1: 't2', 2: 't3', 3: 't4', '4+': 't4' }[k] };
};

test('DC1. Type T1/T2/T3/T4 : aucun effet propre (seul le nombre de chambres compte)', () => {
  const ref = R(baseRaw({ type: 't2' })).scenarios.realiste;
  for (const type of ['studio', 't1', 't3', 't4']) {
    const s = R(baseRaw({ type })).scenarios.realiste;
    close(s.adrAnnual, ref.adrAnnual);
    close(s.occupancyAnnual, ref.occupancyAnnual);
  }
});

test('DC2. Maison : aucun bonus cumulable avec l\'extérieur (bonus maison nul ou exclusif)', () => {
  const flat = R(baseRaw({ type: 't3', bedrooms: '3', area: '80', guests: '6' })).scenarios.realiste;
  const house = R(baseRaw({ type: 'maison', bedrooms: '3', area: '80', guests: '6' })).scenarios.realiste;
  close(house.adrAnnual / flat.adrAnnual, 1 + CFG.size.house.adr);
  const houseTerrace = R(baseRaw({ type: 'maison', bedrooms: '3', area: '80', guests: '6', amenities: ['terrasse'] })).scenarios.realiste;
  const flatTerrace = R(baseRaw({ type: 't3', bedrooms: '3', area: '80', guests: '6', amenities: ['terrasse'] })).scenarios.realiste;
  assert.ok(houseTerrace.adrAnnual / flatTerrace.adrAnnual <= 1 + CFG.size.house.adr + 1e-9);
  assert.equal(CFG.size.house.adr, 0, 'bonus maison : aucune donnée publique ne le justifie une fois chambres et capacité connues');
});

test('DC3. Canapé convertible : aucun effet (le couchage est compté par la capacité)', () => {
  const a = R(baseRaw()).scenarios.realiste;
  const b = R(baseRaw({ amenities: ['canape-lit'] })).scenarios.realiste;
  close(a.adrAnnual, b.adrAnnual);
  close(a.occupancyAnnual, b.occupancyAnnual);
});

test('DC4. Logement typique de chaque taille : surface, capacité et salles de bain n\'ajoutent rien', () => {
  for (const k of CLASSES) {
    const s = R(baseRaw(typical(k))).scenarios.realiste;
    for (const id of ['area', 'guests', 'bathrooms', 'house']) {
      const a = s.adjustments.find((x) => x.id === id);
      close(a.adrEffectPct, 0);
    }
  }
});

test('DC5. Salles de bain : seules celles au-delà de la configuration typique comptent', () => {
  const s4 = R(baseRaw({ ...typical('4+'), bathrooms: '2' })).scenarios.realiste;
  close(s4.adjustments.find((x) => x.id === 'bathrooms').adrEffectPct, 0);
  const s3 = R(baseRaw({ ...typical('3'), bathrooms: '2' })).scenarios.realiste;
  close(s3.adjustments.find((x) => x.id === 'bathrooms').adrEffectPct, CFG.size.bathrooms.perExtraBathroom * 100);
  const s3b = R(baseRaw({ ...typical('3'), bathrooms: '6' })).scenarios.realiste;
  close(s3b.adjustments.find((x) => x.id === 'bathrooms').adrEffectPct, CFG.size.bathrooms.cap * 100);
});

test('DC6. Capacité : correction plafonnée, quel que soit le nombre de voyageurs', () => {
  const s = R(baseRaw({ guests: '20' })).scenarios.realiste;
  close(s.adjustments.find((x) => x.id === 'guests').adrEffectPct, CFG.size.guests.cap * 100);
});

test('DC7. Courbe de taille cohérente : prix et CA croissants, occupation non croissante avec les chambres', () => {
  for (const commune of ['rennes', 'saint-malo', 'vitre', 'liffre']) {
    const rows = CLASSES.map((k) => R(baseRaw({ commune, ...typical(k) })).scenarios.realiste);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].adrAnnual > rows[i - 1].adrAnnual, `${commune} prix ${CLASSES[i]}`);
      assert.ok(rows[i].occupancyAnnual <= rows[i - 1].occupancyAnnual + 1e-9, `${commune} occupation ${CLASSES[i]}`);
      assert.ok(rows[i].nightsRevenue > rows[i - 1].nightsRevenue, `${commune} CA ${CLASSES[i]}`);
    }
  }
});

test('DC8. Cohérence avec le marché : appliqué au mélange de tailles, le modèle restitue la moyenne observée (pas de biais systématique)', () => {
  const market = J('tests/fixtures/market.valid.json');
  for (const [commune, profile] of [['rennes', 'urbain'], ['saint-malo', 'littoral'], ['vitre', 'urbain']]) {
    const mix = CFG.referenceCalibration.mixByProfile[profile];
    const r0 = R(baseRaw({ commune }));
    let adr = 0; let wN = 0; let occ = 0; let wL = 0;
    for (const k of CLASSES) {
      const s = R(baseRaw({ commune, ...typical(k) })).scenarios.realiste;
      adr += mix.nightsShare[k] * s.adrAnnual; wN += mix.nightsShare[k];
      occ += mix.listingShare[k] * s.occupancyAnnual; wL += mix.listingShare[k];
    }
    const m = market.markets[r0.data.marketKey];
    close(adr / wN, m.adr, m.adr * 0.005);
    close(occ / wL, m.occupancy, 0.005);
  }
});

test('DC9. Aucune estimation aberrante sur l\'ensemble communes × tailles × emplacements × équipements', () => {
  const market = J('tests/fixtures/market.valid.json');
  const communes = J('config/communes.json').communes.map((c) => c.id);
  const all = CFG.amenities.items.map((a) => a.id);
  for (const commune of communes) {
    for (const k of CLASSES) {
      for (const location of Object.keys(CFG.location.levels)) {
        for (const amenities of [[], all]) {
          const r = R(baseRaw({ commune, ...typical(k), location, amenities }));
          const s = r.scenarios.realiste;
          const m = market.markets[r.data.marketKey];
          const ratio = s.adrAnnual / m.adr;
          assert.ok(ratio > 0.4 && ratio < 3.5, `${commune} ${k} ${location} : prix ${ratio.toFixed(2)} × marché`);
          const revparRatio = (s.adrAnnual * s.occupancyAnnual) / (m.adr * m.occupancy);
          assert.ok(revparRatio > 0.3 && revparRatio < 3.2, `${commune} ${k} ${location} : RevPAR ${revparRatio.toFixed(2)} × marché`);
          assert.ok(s.occupancyAnnual >= CFG.guards.occupancy[0] && s.occupancyAnnual <= CFG.guards.occupancy[1]);
        }
      }
    }
  }
});

test('DC10. Empilement maximal des atouts (emplacement + tous équipements + surface + capacité + sdb) : borné par le garde-fou', () => {
  const max = R(baseRaw({ location: 'hypercentre', amenities: CFG.amenities.items.map((a) => a.id), area: '200', guests: '10', bathrooms: '5' })).scenarios.performant;
  assert.ok(max.model.secondaryMultiplier <= CFG.guards.adrSecondaryMultiplier[1] + 1e-9);
  const min = R(baseRaw({ location: 'peripherie', area: '10', guests: '1' })).scenarios.prudent;
  assert.ok(min.model.secondaryMultiplier >= CFG.guards.adrSecondaryMultiplier[0] - 1e-9);
});

test('DC11. Les valeurs de marché affichées restent les valeurs observées (le recalage n\'apparaît que dans les ajustements)', () => {
  const r = R(baseRaw());
  close(r.explanation.market.lines.find((l) => l.label.startsWith('Prix moyen')).value, 80);
  const ref = r.explanation.adjustments.items.find((a) => a.id === 'reference');
  assert.ok(ref && ref.kind === 'hypothese_emeraude');
});

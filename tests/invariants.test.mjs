import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../engine/index.js';
import { findInvalidValues } from '../engine/safe.js';
import { ctx, J } from './helpers.mjs';

// Générateur pseudo-aléatoire déterministe (reproductible).
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('21. 500 combinaisons aléatoires : aucune valeur invalide, garde-fous et ordre des scénarios respectés', () => {
  const c = ctx();
  const config = J('config/config.json');
  const communes = J('config/communes.json').communes.map((x) => x.id);
  const types = Object.keys(config.types);
  const locs = Object.keys(config.location.levels);
  const amen = config.amenities.items.map((a) => a.id);
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  for (let i = 0; i < 500; i++) {
    const bedrooms = Math.floor(rand() * 7);
    const months = [...Array(12).keys()].filter(() => rand() > 0.3);
    const raw = {
      commune: pick(communes), type: pick(types), bedrooms: String(bedrooms), bathrooms: String(1 + Math.floor(rand() * 3)),
      area: String(10 + Math.floor(rand() * 250)), guests: String(1 + Math.floor(rand() * 14)), location: pick(locs),
      amenities: amen.filter(() => rand() > 0.6),
      monthsMode: rand() > 0.5 ? 'select' : 'count', monthsCount: String(1 + Math.floor(rand() * 12)), monthsSelected: months.length ? months : [6],
      commissionPct: String(Math.floor(rand() * 51)), cleaningFee: String(Math.floor(rand() * 150)), avgStay: rand() > 0.5 ? '' : String(1 + Math.floor(rand() * 10)), vat: rand() > 0.5
    };
    const r = estimate(raw, c);
    assert.equal(r.ok, true, `combinaison ${i} : ${JSON.stringify(r.errors)}`);
    assert.deepEqual(findInvalidValues(r), [], `combinaison ${i}`);
    const { prudent, realiste, performant } = r.scenarios;
    assert.ok(prudent.nightsRevenue <= realiste.nightsRevenue + 1e-6 && realiste.nightsRevenue <= performant.nightsRevenue + 1e-6, `ordre des scénarios, combinaison ${i}`);
    for (const s of [prudent, realiste, performant]) {
      assert.ok(s.nightsRevenue > 0 && s.ownerIncome > 0 && s.adr > 0);
      assert.ok(s.occupancyAnnual >= config.guards.occupancy[0] - 1e-9 && s.occupancyAnnual <= config.guards.occupancy[1] + 1e-9);
      assert.ok(s.monthly.every((m) => m.occupancy <= config.guards.monthlyOccupancyMax + 1e-9));
      assert.ok(s.model.secondaryMultiplier >= config.guards.adrSecondaryMultiplier[0] - 1e-9 && s.model.secondaryMultiplier <= config.guards.adrSecondaryMultiplier[1] + 1e-9);
      assert.ok(Math.abs(s.ownerIncome + s.commission.amount + s.airbnb.onNights + s.airbnb.vatOnNightsFee - s.nightsRevenue) < 1e-6, 'répartition du CA des nuits');
    }
  }
});

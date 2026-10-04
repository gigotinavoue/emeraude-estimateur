import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../scripts/aggregate-emeraude.mjs';
import { J } from './helpers.mjs';

// Données entièrement FICTIVES, générées pour le test (aucun logement réel).
function fakeRows(nListings, { adr = 90, occ = 0.6, months = 8, epciInsee = '35238', bedrooms = '1' } = {}) {
  const rows = [];
  for (let l = 0; l < nListings; l++) {
    for (let m = 1; m <= months; m++) {
      const avail = 30;
      const booked = Math.round(avail * occ);
      rows.push({
        listing_ref: `FICTIF-${epciInsee}-${bedrooms}-${l}`, commune_insee: epciInsee, epci: '', type: 't2', bedrooms, bathrooms: '1', guests: '3', area_m2: '40',
        location_level: 'standard', amenities: '', month: `2027-${String(m).padStart(2, '0')}`, nights_available: String(avail), nights_booked: String(booked),
        revenue_nights_eur: String(booked * adr), cleaning_collected_eur: '0', stays: '0', airbnb_fees_eur: '0', source: 'test'
      });
    }
  }
  return rows;
}

const deps = () => ({ config: J('config/config.json'), communes: J('config/communes.json'), sources: J('config/sources.json'), market: J('tests/fixtures/market.valid.json') });

test('E1. Agrégation : segment publié à partir de 3 logements, sans identifiant ni montant individuel', () => {
  const { aggregates } = aggregate(fakeRows(3), deps());
  assert.equal(aggregates.segments.length, 1);
  const s = aggregates.segments[0];
  assert.equal(s.key, 'epci:rennes-metropole|bedrooms:1');
  assert.equal(s.listings, 3);
  assert.ok(s.ratioAdr > 1 && s.ratioOcc > 1);
  assert.ok(!JSON.stringify(aggregates).includes('FICTIF'));
});

test('E2. Moins de 3 logements : simple observation interne, rien de publié', () => {
  const r = aggregate(fakeRows(2), deps());
  assert.equal(r.aggregates.segments.length, 0);
  assert.equal(r.internalOnly.length, 1);
});

test('E3. Logement avec moins de 6 mois de données : exclu', () => {
  const r = aggregate(fakeRows(3, { months: 4 }), deps());
  assert.equal(r.aggregates.segments.length, 0);
});

test('E4. Ligne dont le prix par nuit dépasse 3 × le marché : rejetée (ménage probablement mélangé au CA des nuits)', () => {
  const r = aggregate(fakeRows(3, { adr: 400 }), deps());
  assert.equal(r.aggregates.segments.length, 0);
  assert.ok(r.log.some((l) => l.includes('ménage')));
});

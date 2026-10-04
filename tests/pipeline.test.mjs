import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema } from '../scripts/lib/schema.mjs';
import { validateConfigFiles, validateObservations } from '../scripts/validate.mjs';
import { buildMarket, normalizeProfile } from '../scripts/build-market.mjs';
import { normalizeAll } from '../scripts/normalize.mjs';
import { parseCsv } from '../scripts/lib/util.mjs';
import { J, clone } from './helpers.mjs';

const ctxFiles = () => ({ config: J('config/config.json'), communes: J('config/communes.json'), sources: J('config/sources.json') });

test('P1. Fichiers de configuration conformes à leurs schémas', () => {
  assert.deepEqual(validateConfigFiles(), []);
});

test('P2. Toutes les observations produites par les adaptateurs sont conformes au schéma', () => {
  const { observations, summary } = normalizeAll('2026-10-04T00:00:00Z');
  assert.ok(Object.values(summary).every((v) => typeof v === 'number'), JSON.stringify(summary));
  const schema = J('schemas/observation.schema.json');
  for (const o of observations) assert.deepEqual(validateSchema(o, schema), [], o.id);
  assert.ok(summary.adt35 > 0);
});

test('P3. market.json de référence conforme au schéma ; chaque commune a une base directe', () => {
  const m = J('tests/fixtures/market.valid.json');
  assert.deepEqual(validateSchema(m, J('schemas/market.schema.json')), []);
  const { communes } = ctxFiles();
  for (const c of communes.communes) assert.ok(m.markets[`epci:${c.epci}`], `${c.label} : epci:${c.epci}`);
});

test('P4. Indices saisonniers normalisés (Σ jours × indice = 365 ; prix pondéré = 1)', () => {
  const { config } = ctxFiles();
  const days = config.months.referenceYearDays;
  const prof = normalizeProfile([31, 26, 37, 42, 46, 44, 54, 67, 47, 41, 34, 36], [95, 91, 93, 99, 106, 103, 124, 129, 104, 101, 95, 105], 0.5, days);
  const sO = prof.occupancyIndex.reduce((s, x, i) => s + x * days[i], 0);
  assert.ok(Math.abs(sO - 365) < 0.05);
  const w = prof.occupancyIndex.map((x, i) => x * days[i]);
  const sA = w.reduce((s, x, i) => s + x * prof.adrIndex[i], 0) / w.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sA - 1) < 0.001);
});

test('P5. Valeur aberrante dans une source : observation rejetée et EPCI absent du market.json', () => {
  const files = ctxFiles();
  const { observations } = normalizeAll('2026-10-04T00:00:00Z');
  const obs = clone(observations);
  obs.find((o) => o.id === 'adt35_lighthouse|2024|epci:rennes-metropole|adr').value = 950;
  const report = validateObservations(obs, files.config, null);
  assert.equal(report.rejected.length, 1);
  const { market } = buildMarket({ observations: obs, ...files, previous: null, aggregates: null });
  assert.equal(market.markets['epci:rennes-metropole'], undefined);
  assert.ok(market.markets['departement:35']);
});

test('P6. Variation brutale (> 30 % sur le prix) par rapport à la publication précédente : valeur précédente conservée', () => {
  const files = ctxFiles();
  const previous = J('tests/fixtures/market.valid.json');
  const { observations } = normalizeAll('2026-10-04T00:00:00Z');
  const obs = clone(observations).map((o) => (o.source === 'adt35_lighthouse' && o.period.granularity === 'year' ? { ...o, period: { ...o.period, start: '2025-01-01', end: '2025-12-31' }, id: o.id.replace('2024', '2025') } : o));
  obs.find((o) => o.id === 'adt35_lighthouse|2025|epci:rennes-metropole|adr').value = 130; // +62 %
  const report = validateObservations(obs, files.config, previous);
  assert.equal(report.keptPrevious.length, 1);
  const { market } = buildMarket({ observations: obs, ...files, previous, aggregates: null });
  assert.equal(market.markets['epci:rennes-metropole'].adr, 80);
  assert.equal(market.markets['epci:rennes-metropole'].period.end, '2024-12-31');
  assert.equal(market.markets['epci:saint-malo-agglomeration'].period.end, '2025-12-31');
});

test('P7. Agrégats Émeraude : segments de moins de 3 logements jamais publiés', () => {
  const files = ctxFiles();
  const { observations } = normalizeAll('2026-10-04T00:00:00Z');
  const aggregates = { segments: [
    { key: 'epci:rennes-metropole|bedrooms:1', listings: 2, listingMonths: 24, ratioAdr: 1.1, ratioOcc: 1, period: { start: '2027-01', end: '2027-12' } },
    { key: 'epci:rennes-metropole|bedrooms:2', listings: 6, listingMonths: 60, ratioAdr: 1.1, ratioOcc: 1, period: { start: '2027-01', end: '2027-12' } }
  ] };
  const { market } = buildMarket({ observations, ...files, previous: null, aggregates });
  assert.equal(market.emeraude.segments.length, 1);
  assert.equal(market.emeraude.segments[0].listings, 6);
});

test('P8. Source mensuelle Insee indisponible : profil urbain construit avec le repli documenté', () => {
  const files = ctxFiles();
  const { observations } = normalizeAll('2026-10-04T00:00:00Z');
  const { market } = buildMarket({ observations: observations.filter((o) => o.source !== 'insee_hotels'), ...files, previous: null, aggregates: null });
  assert.ok(market.seasonality.urbain.basis.includes('Repli'));
});

test('P9. Lecteur CSV : guillemets et virgules internes', () => {
  const rows = parseCsv('a,b\n"x, y",2\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: '2' }]);
});

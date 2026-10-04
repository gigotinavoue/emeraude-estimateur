// Actualisation des données (octobre 2026) : non-régression des données, métadonnées, fraîcheur, historique,
// confidentialité Émeraude et stabilité des 8 logements de référence. Aucune modification du moteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { J, ROOT, clone } from './helpers.mjs';
import { validateSchema } from '../scripts/lib/schema.mjs';
import { freshnessOf, minStatus } from '../scripts/lib/freshness.mjs';
import { readIndicators, indicatorRowErrors } from '../scripts/adapters/indicators.mjs';
import { writeHistory, splitByYear } from '../scripts/history-market.mjs';
import { dataStatus, CLASSIFICATION } from '../scripts/check-freshness.mjs';
import { lastPeriod } from '../scripts/fetch-public.mjs';
import { referenceProperties } from '../scripts/audit/reference-properties.mjs';

const MARKET = J('dist/market.json');
const CONFIG = J('config/config.json');
const COMMUNES = J('config/communes.json');
const SOURCES = J('config/sources.json');
const NOW = new Date('2026-10-04T12:00:00Z');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const usedKeys = [...new Set(COMMUNES.communes.map((c) => `epci:${c.epci}`))];

test('DR1. Structure : market.json conforme au schéma ; chaque marché porte des métadonnées complètes', () => {
  assert.deepEqual(validateSchema(MARKET, J('schemas/market.schema.json')), []);
  for (const [k, m] of Object.entries(MARKET.markets)) {
    assert.ok(m.meta, `${k} sans métadonnées`);
    for (const f of ['source', 'sourceUrl', 'publicationDate', 'periodStart', 'periodEnd', 'retrievedAt', 'territory', 'methodology', 'license', 'freshnessDays', 'freshnessMonths', 'status', 'dataClass']) assert.ok(m.meta[f] !== undefined && m.meta[f] !== null && m.meta[f] !== '', `${k}.meta.${f} vide`);
    assert.equal(m.meta.dataClass, 'OBSERVÉE', k);
  }
});

test('DR2. Valeurs : occupation dans [0 ; 1], prix et séjour dans les bornes, cohérence des prix entre territoires', () => {
  const v = CONFIG.validation;
  for (const [k, m] of Object.entries(MARKET.markets)) {
    assert.ok(m.occupancy > 0 && m.occupancy < 1, `${k} occupation ${m.occupancy}`);
    assert.ok(m.adr >= v.adr[0] && m.adr <= v.adr[1], `${k} prix ${m.adr}`);
    assert.ok(m.avgStay >= v.avgStay[0] && m.avgStay <= v.avgStay[1], `${k} séjour ${m.avgStay}`);
  }
  const epciAdr = Object.entries(MARKET.markets).filter(([k]) => k.startsWith('epci:')).map(([, m]) => m.adr);
  const dep = MARKET.markets['departement:35'];
  assert.ok(dep.adr >= Math.min(...epciAdr) && dep.adr <= Math.max(...epciAdr), 'prix départemental hors de l\'éventail des EPCI');
  assert.ok(MARKET.markets['epci:saint-malo-agglomeration'].adr > MARKET.markets['epci:rennes-metropole'].adr, 'littoral moins cher que Rennes : incohérent');
  for (const s of Object.values(MARKET.seasonality)) {
    assert.ok(s.occupancyIndex.every((x) => x > 0 && x < 3));
    assert.ok(s.adrIndex.every((x) => x > 0.5 && x < 1.5));
  }
});

test('DR3. Périodes et dates : formats valides, début ≤ fin, fin ≤ récupération, publication après la période', () => {
  const metas = [...Object.values(MARKET.markets).map((m) => m.meta), ...Object.values(MARKET.seasonality).flatMap((s) => [s.meta.occupancy, s.meta.adr]), MARKET.controls.eurostatRennes.meta];
  for (const m of metas) {
    assert.match(m.periodStart, DATE);
    assert.match(m.periodEnd, DATE);
    assert.ok(m.periodStart <= m.periodEnd, `${m.source} période inversée`);
    assert.ok(!Number.isNaN(Date.parse(m.retrievedAt)), `${m.source} retrievedAt invalide`);
    assert.ok(m.retrievedAt.slice(0, 10) >= m.periodEnd, `${m.source} récupérée avant la fin de sa période`);
    if (m.publicationDate) assert.ok(m.publicationDate >= m.periodEnd.slice(0, 7), `${m.source} publiée avant la fin de sa période`);
  }
});

test('DR4. Territoires : chaque commune a une base intercommunale ; le territoire déclaré correspond au marché', () => {
  for (const k of usedKeys) assert.ok(MARKET.markets[k], `${k} absent`);
  for (const [k, m] of Object.entries(MARKET.markets)) {
    assert.equal(m.meta.territory, m.label, k);
    assert.equal(m.geoLevel, k.split(':')[0]);
  }
});

test('DR5. Sources : renseignées et connues ; licence reprise quand la source la précise', () => {
  for (const m of Object.values(MARKET.markets)) {
    assert.ok(SOURCES.sources[m.meta.source], m.meta.source);
    if (SOURCES.sources[m.meta.source].licence) assert.ok(m.meta.license);
  }
  for (const id of ['adt35_chiffres_cles', 'audiar_observatoire']) assert.ok(SOURCES.sources[id] && SOURCES.sources[id].licence, id);
  assert.match(SOURCES.sources.eurostat_platforms.licence, /commerciale/);
  assert.match(SOURCES.sources.insee_hotels.licence, /Etalab/);
});

test('DR6. Fraîcheur : HIGH ≤ 15 mois, MEDIUM ≤ 27 mois, LOW au-delà (mesurée depuis la fin de période)', () => {
  const at = new Date('2026-10-04T00:00:00Z');
  assert.deepEqual(freshnessOf('2024-12-31', at, CONFIG), { freshnessDays: 642, freshnessMonths: 21, status: 'MEDIUM' });
  assert.equal(freshnessOf('2025-12-31', at, CONFIG).status, 'HIGH');
  assert.equal(freshnessOf('2025-07-04', at, CONFIG).status, 'HIGH'); // 15,0 mois
  assert.equal(freshnessOf('2025-07-03', at, CONFIG).status, 'MEDIUM'); // 15,03 mois
  assert.equal(freshnessOf('2024-07-04', at, CONFIG).status, 'MEDIUM'); // 27,0 mois
  assert.equal(freshnessOf('2024-07-03', at, CONFIG).status, 'LOW');
  assert.equal(freshnessOf(null, at, CONFIG).status, 'LOW');
  assert.equal(minStatus(['HIGH', 'MEDIUM', 'HIGH']), 'MEDIUM');
  const rm = MARKET.markets['epci:rennes-metropole'].meta;
  const at2 = new Date(rm.freshnessComputedAt);
  assert.equal(rm.freshnessMonths, freshnessOf(rm.periodEnd, at2, CONFIG).freshnessMonths);
});

test('DR7. Indicateurs 2025 : présents, sourcés (page, URL, récupération réelle), et JAMAIS utilisés comme base', () => {
  const { indicators, errors } = readIndicators();
  assert.deepEqual(errors, []);
  const manifest = J('data/raw/manifest.json').files;
  const dep = indicators.filter((x) => x.source === 'adt35_chiffres_cles');
  assert.equal(dep.find((x) => x.indicator === 'tjm_eur').value, 137);
  assert.equal(dep.find((x) => x.indicator === 'occupancy_pct').value, 42);
  assert.equal(dep.find((x) => x.indicator === 'avg_stay_days').value, 3.2);
  for (const x of indicators) {
    assert.ok(x.page && x.sourceUrl && x.publicationDate && x.retrievedAt, x.id);
    assert.ok(Object.values(manifest).some((m) => m.retrievedAt === x.retrievedAt), `${x.id} : date de récupération absente du registre`);
  }
  // La base ne provient que de sources déclarées « market_base » ; un indicateur n'y entre jamais.
  for (const [k, m] of Object.entries(MARKET.markets)) assert.ok(SOURCES.sources[m.source].usage.includes('market_base'), `${k} : source ${m.source} non autorisée comme base`);
  const base = MARKET.markets['departement:35'];
  const tjm = dep.find((x) => x.indicator === 'tjm_eur');
  if (base.period.end === tjm.period.end) assert.notEqual(base.adr, tjm.value);
  else assert.notEqual(base.adr, tjm.value, 'le TJM 2025 (série révisée) ne doit pas remplacer la base');
  assert.deepEqual(J('data/market/index.json').baseYearInUse, [...new Set(Object.values(MARKET.markets).map((m) => Number(m.period.end.slice(0, 4))))].sort());
  const cmp = MARKET.controls.indicatorComparisons.find((x) => x.id === 'dep_adr');
  assert.equal(cmp.comparable, false);
  assert.ok((MARKET.indicators['2025'] || []).length >= 20);
});

test('DR8. Valeurs impossibles détectées : pourcentage > 100, prix invraisemblable, période inversée, page manquante', () => {
  const ok = { indicator: 'occupancy_pct', value: '42', unit: 'percent', geo_id: 'departement:35', period_start: '2025-01-01', period_end: '2025-12-31', page: '15' };
  assert.deepEqual(indicatorRowErrors(ok), []);
  assert.ok(indicatorRowErrors({ ...ok, value: '140' }).length);
  assert.ok(indicatorRowErrors({ ...ok, value: 'n/a' }).length);
  assert.ok(indicatorRowErrors({ ...ok, period_end: '2024-12-31' }).length);
  assert.ok(indicatorRowErrors({ ...ok, page: '' }).length);
  assert.ok(indicatorRowErrors({ ...ok, geo_id: 'rennes' }).length);
  assert.ok(indicatorRowErrors({ ...ok, indicator: 'tjm_eur', unit: 'EUR/night', value: '5' }).length);
  assert.ok(indicatorRowErrors({ ...ok, indicator: 'nights_booked', unit: 'nights', value: '-3' }).length);
});

test('DR9. Les 8 logements de référence : résultats identiques à la dernière référence acceptée', () => {
  // La référence acceptée est mise à jour (et l'ancienne archivée) uniquement lors d'une activation contrôlée (scripts/refresh.mjs).
  const acc = J('data/history/reference-accepted.json');
  const before = acc.properties;
  const after = referenceProperties(MARKET, new Date(`${acc.computedFor}T12:00:00Z`));
  assert.equal(after.length, 8);
  for (const [i, a] of after.entries()) {
    const b = before[i];
    assert.equal(a.label, b.label);
    for (const k of ['marketKey', 'adr', 'occupancyPct', 'nightsRevenue', 'central', 'low', 'high', 'uncertaintyPct', 'confidence']) assert.deepEqual(a[k], b[k], `${a.label} : ${k}`);
  }
});

test('DR10. Historique par millésime : 2024 (base) et 2025 (indicateurs) ; aucun écrasement silencieux', () => {
  const idx = J('data/market/index.json');
  assert.deepEqual(idx.baseYearInUse, [2024]);
  assert.ok(fs.existsSync(path.join(ROOT, 'data/market/2024/base.json')));
  assert.ok(fs.existsSync(path.join(ROOT, 'data/market/2025/indicators.json')));
  const dir = 'tests/tmp-history';
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  try {
    const first = writeHistory(MARKET, { dir, stamp: '2026-10-04T00:00:00.000Z' });
    assert.ok(first.log.every((l) => l.action === 'created'));
    const same = writeHistory(MARKET, { dir, stamp: '2026-10-05T00:00:00.000Z' });
    assert.equal(same.log.length, 0, 'contenu identique : rien ne doit être réécrit');
    const changed = clone(MARKET);
    changed.markets['epci:rennes-metropole'].adr = 81;
    const third = writeHistory(changed, { dir, stamp: '2026-10-06T00:00:00.000Z' });
    const r = third.log.find((l) => l.file === `${dir}/2024/base.json`);
    assert.equal(r.action, 'replaced');
    assert.ok(fs.existsSync(path.join(ROOT, r.archivedAs)), 'ancienne version non archivée');
    assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, r.archivedAs), 'utf8')).markets['epci:rennes-metropole'].adr, 80);
  } finally {
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  }
  assert.deepEqual(Object.keys(splitByYear(MARKET)).sort(), ['2024', '2025']);
});

test('DR11. Fraîcheur par famille : marché MEDIUM, saisonnalité MEDIUM, indicateurs et contrôles HIGH ; global = familles de calcul', () => {
  const s = dataStatus({ market: MARKET, communes: COMMUNES, config: CONFIG, today: NOW });
  const by = Object.fromEntries(s.families.map((f) => [f.id, f]));
  // Statut attendu de chaque famille = fraîcheur de son élément le plus ancien (seuils 15 / 27 mois).
  for (const f of s.families) assert.equal(f.status, freshnessOf(f.periods.oldestEnd, NOW, CONFIG).status, f.id);
  assert.equal(s.globalDataConfidence, minStatus([by.market.status, by.seasonality.status]));
  assert.equal(s.marketDataYear, [...new Set(Object.values(MARKET.markets).map((m) => m.period.end.slice(0, 4)))].join(', '));
  if (s.marketDataYear === '2024') assert.equal(s.globalDataConfidence, 'MEDIUM'); // situation au 04/10/2026
  assert.ok(by.seasonality.items.every((x) => x.dataClass === 'PROXY'), 'un profil saisonnier départemental ne doit jamais être présenté comme observation locale');
  const classes = new Set(CLASSIFICATION.map((c) => c.dataClass));
  for (const c of ['OBSERVÉE', 'HYPOTHÈSE', 'PROXY', 'CALIBRATION', 'FALLBACK']) assert.ok(classes.has(c), c);
});

test('DR12. Sources automatiques : la dernière période enregistrée est bien celle des données', () => {
  for (const f of ['data/raw/eurostat/tour_ce_oarc_FR016C.json', 'data/raw/eurostat/tour_ce_omn12_FRH0.json', 'data/raw/insee/ds_tour_freq_dep35_hotels.json']) {
    const raw = J(f);
    assert.ok(raw.retrievedAt && !Number.isNaN(Date.parse(raw.retrievedAt)), f);
    assert.equal(lastPeriod(raw.data), raw.lastPeriod, f);
  }
});

test('DR13. Données Émeraude : dossier privé exclu de Git, modèle sans aucune donnée, aucune calibration appliquée', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gi, /^data\/emeraude\/private\/\*$/m);
  const tpl = fs.readFileSync(path.join(ROOT, 'data/emeraude/listings_monthly.TEMPLATE.csv'), 'utf8').trim().split(/\r?\n/);
  assert.equal(tpl.length, 1, 'le modèle ne doit contenir que les en-têtes');
  const required = J('schemas/emeraude-private.schema.json').required;
  for (const c of required) assert.ok(tpl[0].split(',').includes(c), c);
  assert.deepEqual(MARKET.emeraude.segments, []);
  assert.ok(!JSON.stringify(MARKET).includes('listing_ref'));
});

test('DR14. Moteur de calcul inchangé (empreintes identiques à celles du début de l\'actualisation)', () => {
  const ref = J('tests/fixtures/engine-hashes.json').files;
  for (const [f, h] of Object.entries(ref)) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'engine', f))).digest('hex');
    assert.equal(got, h, `engine/${f} modifié`);
  }
});

test('DR15. Émulateur : millésime, âge, dernière actualisation, saisonnalité et alerte d\'ancienneté affichés', () => {
  const html = fs.readFileSync(path.join(ROOT, 'reports/preview-artifact.html'), 'utf8');
  for (const id of ['mYear', 'mAge', 'mUpdated', 'mSeason', 'staleBanner']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Les données de marché disponibles sont anciennes'));
  assert.ok(html.includes('Dernière actualisation'));
});

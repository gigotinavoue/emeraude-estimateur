// Automatisation de l'actualisation (octobre 2026) : contrôles avant acceptation, seuils, simulation, activation,
// historique, alertes, publications annuelles, sécurité et workflow. Aucun appel réseau : API simulée.
// Les scénarios complets tournent sur une COPIE temporaire du dépôt (les données actives réelles ne sont jamais touchées).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { J, ROOT, clone } from './helpers.mjs';
import { checkSource, compareMarkets, compareReferences, lagMonths, worst } from '../scripts/lib/refresh-core.mjs';
import { runRefresh, copyRepo, toMarkdown } from '../scripts/refresh.mjs';
import { runSecurityCheck, ignoreMatcher } from '../scripts/security-check.mjs';
import { extractPdfLinks } from '../scripts/detect-publications.mjs';
import { listVersions, restoreVersion } from '../scripts/restore-market.mjs';
import { alertBody } from '../scripts/ci/alert-issue.mjs';
import { referenceProperties } from '../scripts/audit/reference-properties.mjs';

const AUTO = J('config/automation.json');
const CFG = J('config/config.json');
const MARKET = J('dist/market.json');
const TODAY = new Date('2026-10-05T12:00:00Z');
const RAW = {
  eurostat_city: J('data/raw/eurostat/tour_ce_oarc_FR016C.json'),
  eurostat_region: J('data/raw/eurostat/tour_ce_omn12_FRH0.json'),
  insee_hotels: J('data/raw/insee/ds_tour_freq_dep35_hotels.json')
};
const cand = (raw, data = raw.data) => ({ retrievedAt: TODAY.toISOString(), data });

// Ajoute un mois Insee plausible (copie du dernier mois publié).
function inseeWithNextMonth(raw, value) {
  const data = clone(raw.data);
  const last = raw.lastPeriod;
  const [y, m] = last.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const adds = data.observations.filter((o) => o.dimensions.TIME_PERIOD === last).map((o) => {
    const c = clone(o);
    c.dimensions.TIME_PERIOD = next;
    if (value !== undefined && c.measures && c.measures.OBS_VALUE_NIVEAU) c.measures.OBS_VALUE_NIVEAU.value = value;
    return c;
  });
  data.observations.push(...adds);
  return { data, next };
}
function inseeScaled(raw, f) {
  const data = clone(raw.data);
  for (const o of data.observations) if (o.measures && o.measures.OBS_VALUE_NIVEAU && typeof o.measures.OBS_VALUE_NIVEAU.value === 'number') o.measures.OBS_VALUE_NIVEAU.value = f(o.measures.OBS_VALUE_NIVEAU.value, o);
  return data;
}

// API simulée : Eurostat, Insee, pages de publication.
function fakeFetch({ insee = RAW.insee_hotels.data, city = RAW.eurostat_city.data, region = RAW.eurostat_region.data, down = [], pages = {} } = {}) {
  const resp = (body, status = 200) => ({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(body)), text: async () => String(body), arrayBuffer: async () => Buffer.from('%PDF-1.4 test') });
  return async (url) => {
    const u = String(url);
    if (u.includes('api.insee.fr')) { if (down.includes('insee')) throw new Error('ECONNRESET (simulé)'); return resp(insee); }
    if (u.includes('tour_ce_oarc')) { if (down.includes('city')) throw new Error('HTTP 503 (simulé)'); return resp(city); }
    if (u.includes('tour_ce_omn12')) { if (down.includes('region')) throw new Error('HTTP 503 (simulé)'); return resp(region); }
    if (u.endsWith('.pdf')) return resp('%PDF-1.4');
    for (const [k, html] of Object.entries(pages)) if (u.includes(k)) return resp(html);
    return resp('<html></html>');
  };
}

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emeraude-test-repo-'));
  copyRepo(ROOT, dir);
  return dir;
}
function treeHash(root, dirs = ['data', 'dist', 'embed', 'deploy', 'reports/preview-artifact.html']) {
  const h = crypto.createHash('sha256');
  const walk = (rel) => {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isDirectory()) for (const e of fs.readdirSync(full).sort()) walk(`${rel}/${e}`);
    else h.update(rel).update(fs.readFileSync(full));
  };
  dirs.forEach(walk);
  return h.digest('hex');
}
const opts = (root, extra = {}) => ({ root, today: TODAY, runTests: false, skipPublications: true, retryDelayMs: 0, ...extra });

// ---------- Contrôles d'une réponse de source ----------

test('A1. Réponse identique : UNCHANGED (aucune reconstruction nécessaire)', () => {
  for (const [id, src] of Object.entries(AUTO.sources)) {
    const r = checkSource(src, cand(RAW[id]), RAW[id], TODAY);
    assert.equal(r.status, 'UNCHANGED', id);
    assert.equal(r.level, 'ACCEPT', id);
  }
});

test('A2. Nouvelle période plausible : NEW_PERIOD acceptée', () => {
  const { data, next } = inseeWithNextMonth(RAW.insee_hotels);
  const r = checkSource(AUTO.sources.insee_hotels, cand(RAW.insee_hotels, data), RAW.insee_hotels, TODAY);
  assert.equal(r.status, 'NEW_PERIOD');
  assert.equal(r.level, 'ACCEPT');
  assert.equal(r.lastPeriod, next);
});

test('A3. Réponses défaillantes refusées : vide, sans période, période antérieure, tronquée, hors bornes, future', () => {
  const src = AUTO.sources.insee_hotels;
  const prev = RAW.insee_hotels;
  assert.equal(checkSource(src, null, prev, TODAY).level, 'REJECT');
  assert.equal(checkSource(src, cand(prev, {}), prev, TODAY).level, 'REJECT');
  assert.equal(checkSource(src, cand(prev, { observations: [] }), prev, TODAY).level, 'REJECT');
  const older = clone(prev.data);
  older.observations = older.observations.filter((o) => o.dimensions.TIME_PERIOD < '2026-01');
  const rOld = checkSource(src, cand(prev, older), prev, TODAY);
  assert.equal(rOld.level, 'REJECT');
  assert.ok(rOld.issues.some((i) => /antérieure/.test(i.msg)));
  const trunc = clone(prev.data);
  trunc.observations = trunc.observations.slice(-10);
  assert.equal(checkSource(src, cand(prev, trunc), prev, TODAY).level, 'REJECT');
  const { data: crazy } = inseeWithNextMonth(prev, 140);
  const rC = checkSource(src, cand(prev, crazy), prev, TODAY);
  assert.equal(rC.level, 'REJECT');
  assert.ok(rC.issues.some((i) => /hors bornes/.test(i.msg)));
  const { data: fut } = inseeWithNextMonth(prev);
  assert.equal(checkSource(src, cand(prev, fut), prev, new Date('2026-07-15T00:00:00Z')).level, 'REJECT', 'période postérieure à la date du jour');
});

test('A4. Révision des périodes déjà publiées : faible → accepté, forte → REVIEW, massive → REJECT', () => {
  const src = AUTO.sources.insee_hotels;
  const prev = RAW.insee_hotels;
  const small = inseeScaled(prev, (v) => v + 1); // +1 point
  assert.equal(checkSource(src, cand(prev, small), prev, TODAY).level, 'ACCEPT');
  const mid = inseeScaled(prev, (v, o) => (o.dimensions.TIME_PERIOD === '2025-08' ? Math.min(100, v + 15) : v));
  assert.equal(checkSource(src, cand(prev, mid), prev, TODAY).level, 'REVIEW');
  const big = inseeScaled(prev, (v, o) => (o.dimensions.TIME_PERIOD === '2025-08' ? Math.max(5, v - 40) : v));
  assert.equal(checkSource(src, cand(prev, big), prev, TODAY).level, 'REJECT');
  const eu = clone(RAW.eurostat_city.data);
  for (const k of Object.keys(eu.value)) eu.value[k] = eu.value[k] * 2;
  assert.equal(checkSource(AUTO.sources.eurostat_city, cand(RAW.eurostat_city, eu), RAW.eurostat_city, TODAY).level, 'REJECT');
});

test('A5. Retard de publication mesuré en mois (annuel et mensuel)', () => {
  assert.equal(lagMonths('2026-07', TODAY), 3);
  assert.equal(lagMonths('2025', TODAY), 10);
  assert.equal(lagMonths(null, TODAY), null);
  assert.equal(worst(['ACCEPT', 'REVIEW']), 'REVIEW');
  assert.equal(worst(['REVIEW', 'REJECT', 'ACCEPT']), 'REJECT');
});

// ---------- Seuils de variation ----------

test('A6. Marché : seuils prix 10/30 %, occupation 5/15 pts, séjour 15/35 % ; marché manquant ou vide → REJECT', () => {
  const th = AUTO.thresholds;
  const v = CFG.validation;
  assert.deepEqual(compareMarkets(MARKET, MARKET, th, v).filter((c) => c.level !== 'ACCEPT'), []);
  const lvl = (mut) => { const c = clone(MARKET); mut(c.markets['epci:rennes-metropole']); return worst(compareMarkets(MARKET, c, th, v).map((x) => x.level)); };
  assert.equal(lvl((m) => { m.adr *= 1.08; }), 'ACCEPT');
  assert.equal(lvl((m) => { m.adr *= 1.12; }), 'REVIEW');
  assert.equal(lvl((m) => { m.adr *= 1.4; }), 'REJECT');
  assert.equal(lvl((m) => { m.occupancy += 0.06; }), 'REVIEW');
  assert.equal(lvl((m) => { m.occupancy -= 0.2; }), 'REJECT');
  assert.equal(lvl((m) => { m.avgStay *= 1.2; }), 'REVIEW');
  assert.equal(lvl((m) => { m.adr = 900; }), 'REJECT');
  assert.equal(lvl((m) => { m.period = { start: '2025-01-01', end: '2025-12-31' }; }), 'REVIEW');
  const missing = clone(MARKET);
  delete missing.markets['epci:vitre-communaute'];
  assert.equal(worst(compareMarkets(MARKET, missing, th, v).map((x) => x.level)), 'REJECT');
  assert.equal(worst(compareMarkets(MARKET, { markets: {} }, th, v).map((x) => x.level)), 'REJECT');
  const season = clone(MARKET);
  season.seasonality.urbain.occupancyIndex[6] += 0.6;
  assert.equal(worst(compareMarkets(MARKET, season, th, v).map((x) => x.level)), 'REJECT');
});

test('A7. Logements de référence : +4,4 % signalé et accepté ; +12 % REVIEW ; 10 427 → 145 000 € REJECT', () => {
  const th = AUTO.thresholds;
  const before = referenceProperties(MARKET, TODAY);
  const scale = (f) => before.map((b) => ({ ...b, nightsRevenue: Math.round(b.nightsRevenue * f), central: Math.round((b.nightsRevenue * f) / 100) * 100 }));
  const ok = compareReferences(before, scale(1.044), th);
  assert.ok(ok.every((r) => r.level === 'ACCEPT' && r.signal && r.revenuePct === 4.4));
  assert.ok(compareReferences(before, scale(1.12), th).every((r) => r.level === 'REVIEW'));
  const crazy = before.map((b) => (b.label === 'Rennes T2 standard' ? { ...b, nightsRevenue: 145000, central: 145000 } : b));
  const rows = compareReferences(before, crazy, th);
  assert.equal(rows.find((r) => r.label === 'Rennes T2 standard').level, 'REJECT');
  assert.equal(compareReferences(before, before.map((b) => ({ ...b, nightsRevenue: NaN })), th)[0].level, 'REJECT');
  assert.equal(compareReferences(before, before, th).every((r) => r.level === 'ACCEPT' && !r.signal), true);
});

// ---------- Scénarios complets (copie temporaire du dépôt) ----------

test('A8. Aucune nouvelle période : rien n\'est reconstruit ni modifié, statut OK, aucune alerte', async () => {
  const root = tmpRepo();
  try {
    const h0 = treeHash(root);
    const r = await runRefresh(opts(root, { fetchImpl: fakeFetch() }));
    assert.equal(r.decision, 'NO_CHANGE');
    assert.equal(r.status, 'OK');
    assert.equal(r.alerts.length, 0);
    assert.equal(r.promoted, false);
    assert.equal(treeHash(root), h0, 'les données actives ont été modifiées');
    assert.ok(fs.existsSync(path.join(root, 'out/refresh-report.md')));
    // Sans nouvelle version validée : l'artifact n'est ni régénéré ni à republier, aucune issue.
    assert.equal(r.artifact, null);
    assert.deepEqual(r.manualActions, []);
    assert.equal(r.needsAttention, false);
    assert.match(toMarkdown(r), /artifact non régénéré, aucune republication nécessaire/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A9. Simulation (dry-run) d\'une nouvelle période : décision et impact calculés, données actives intactes', async () => {
  const root = tmpRepo();
  try {
    const h0 = treeHash(root);
    const { data, next } = inseeWithNextMonth(RAW.insee_hotels);
    const r = await runRefresh(opts(root, { dryRun: true, fetchImpl: fakeFetch({ insee: data }) }));
    const s = r.sources.find((x) => x.id === 'insee_hotels');
    assert.equal(s.status, 'NEW_PERIOD');
    assert.equal(s.previousPeriod, RAW.insee_hotels.lastPeriod);
    assert.equal(s.newPeriod, next);
    assert.equal(r.decision, 'ACCEPT');
    assert.equal(r.references.length, 8);
    assert.equal(r.promoted, false);
    assert.equal(treeHash(root), h0);
    const md = toMarkdown(r);
    assert.match(md, /simulation/);
    assert.match(md, new RegExp(next));
    // L'artifact est construit et contrôlé en zone de préparation, jamais activé en simulation.
    assert.equal(r.artifact.generated, true);
    assert.ok(r.artifact.references.every((x) => x.ok));
    assert.deepEqual(r.manualActions, []);
    assert.match(md, /générée en simulation uniquement/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A10. Nouvelle période réelle : ancienne version archivée, nouvelle activée, historique et références conservés', async () => {
  const root = tmpRepo();
  try {
    const before = JSON.parse(fs.readFileSync(path.join(root, 'dist/market.json'), 'utf8'));
    const { data, next } = inseeWithNextMonth(RAW.insee_hotels);
    const r = await runRefresh(opts(root, { fetchImpl: fakeFetch({ insee: data }) }));
    assert.equal(r.decision, 'ACCEPT');
    assert.equal(r.promoted, true);
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/raw/insee/ds_tour_freq_dep35_hotels.json'), 'utf8'));
    assert.equal(raw.lastPeriod, next);
    assert.ok(fs.existsSync(path.join(root, `data/raw/insee/archive/ds_tour_freq_dep35_hotels.${RAW.insee_hotels.lastPeriod}.json`)), 'ancienne version brute non archivée');
    const versions = listVersions(root);
    assert.ok(versions.some((v) => v.generatedAt === before.generatedAt), 'ancien market.json non archivé');
    const after = JSON.parse(fs.readFileSync(path.join(root, 'dist/market.json'), 'utf8'));
    assert.notEqual(after.generatedAt, before.generatedAt);
    for (const k of Object.keys(before.markets)) assert.equal(after.markets[k].adr, before.markets[k].adr, 'la base de marché ne doit pas changer avec une source de contrôle');
    assert.ok(fs.existsSync(path.join(root, 'data/history/build-inputs.json')));
    assert.ok(fs.readdirSync(path.join(root, 'data/history/refresh-reports')).length >= 1);
    // Artifact Claude régénéré avec la nouvelle version, contrôlé, et republication signalée comme action manuelle.
    const art = fs.readFileSync(path.join(root, 'dist/estimateur-artifact.html'), 'utf8');
    const snap = JSON.parse(/const SNAPSHOT=(\{.*\});\r?\nconst REMOTE/.exec(art)[1]);
    assert.equal(snap.market.generatedAt, after.generatedAt);
    assert.equal(snap.referenceAccepted.marketGeneratedAt, after.generatedAt);
    assert.equal(r.artifact.generated, true);
    assert.equal(r.artifact.changed, true);
    assert.equal(r.artifact.references.length, 8);
    assert.ok(r.artifact.references.every((x) => x.ok));
    assert.equal(r.artifact.marketSha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'dist/market.json'))).digest('hex'));
    assert.equal(r.manualActions.length, 1);
    assert.equal(r.needsAttention, true, 'la republication manuelle doit ouvrir l\'issue d\'alerte');
    assert.equal(r.status, 'OK', 'une action manuelle ne dégrade pas le statut des données');
    const md = toMarkdown(r);
    assert.match(md, /Nouvelle version disponible/);
    assert.match(md, /Action manuelle nécessaire/);
    assert.match(md, /SHA-256 [0-9a-f]{64}/);
    assert.match(alertBody(r).body, /ACTION MANUELLE — republication de l'artifact Claude/);
    // Deuxième passage avec la même réponse : plus rien à faire, rien à republier.
    const h1 = treeHash(root);
    const r2 = await runRefresh(opts(root, { fetchImpl: fakeFetch({ insee: data }) }));
    assert.equal(r2.decision, 'NO_CHANGE');
    assert.deepEqual(r2.manualActions, []);
    assert.equal(treeHash(root), h1, 'aucun fichier versionné ne doit changer sans nouvelle version');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A11. Source indisponible : version précédente conservée, WARNING sans alerte, puis alerte après 3 échecs consécutifs', async () => {
  const root = tmpRepo();
  try {
    const h0 = treeHash(root, ['dist', 'data/raw', 'data/market']);
    let r;
    for (let i = 1; i <= 3; i++) {
      r = await runRefresh(opts(root, { fetchImpl: fakeFetch({ down: ['insee'] }) }));
      assert.equal(r.sources.find((x) => x.id === 'insee_hotels').status, 'UNAVAILABLE');
      assert.equal(r.status, 'WARNING');
      assert.equal(r.alerts.length, i < 3 ? 0 : 1, `exécution ${i}`);
    }
    assert.match(r.alerts[0].msg, /3 exécutions consécutives/);
    assert.equal(treeHash(root, ['dist', 'data/raw', 'data/market']), h0, 'aucune donnée ne doit être perdue ni modifiée');
    const health = JSON.parse(fs.readFileSync(path.join(root, 'data/history/source-health.json'), 'utf8'));
    assert.equal(health.sources.insee_hotels.consecutiveFailures, 3);
    await runRefresh(opts(root, { fetchImpl: fakeFetch() }));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/history/source-health.json'), 'utf8')).sources.insee_hotels.consecutiveFailures, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A12. Réponse aberrante (occupation 140 %) : refusée, version active conservée, alerte', async () => {
  const root = tmpRepo();
  try {
    const h0 = treeHash(root, ['dist', 'data/raw', 'data/market']);
    const { data } = inseeWithNextMonth(RAW.insee_hotels, 140);
    const r = await runRefresh(opts(root, { fetchImpl: fakeFetch({ insee: data }) }));
    assert.equal(r.sources.find((x) => x.id === 'insee_hotels').level, 'REJECT');
    assert.equal(r.promoted, false);
    assert.ok(r.alerts.some((a) => a.kind === 'donnée invalide'));
    assert.equal(treeHash(root, ['dist', 'data/raw', 'data/market']), h0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A13. Variation anormale du marché (saisie annuelle à 900 €/nuit) : activation bloquée, validation humaine requise', async () => {
  const root = tmpRepo();
  try {
    const f = path.join(root, 'data/raw/adt35/epci_2024.csv');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/(epci:rennes-metropole,[^,]+,49,-5,352046,9\.5,)80,/, '$1900,'));
    const h0 = treeHash(root, ['dist', 'data/market']);
    const r = await runRefresh(opts(root, { noFetch: true }));
    assert.ok(r.rebuild.reasons.some((x) => /epci_2024\.csv/.test(x)), 'la saisie manuelle doit déclencher une reconstruction');
    assert.equal(r.decision, 'REJECT');
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.promoted, false);
    assert.equal(treeHash(root, ['dist', 'data/market']), h0);
    assert.ok(r.alerts.some((a) => a.kind === 'variation anormale'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A14. Nouvelle publication annuelle : « NOUVELLE PUBLICATION À VÉRIFIER », notée, jamais intégrée au calcul', async () => {
  const root = tmpRepo();
  try {
    const known = AUTO.publications.known.map((u) => `<a href="${u}">x</a>`).join('');
    const newUrl = 'https://www.ille-et-vilaine-tourisme.bzh/app/uploads/bretagne-35/2027/06/2026_Chiffres-Cles.pdf';
    const pages = { 'chiffres-cles': `<html>${known}<a href="${newUrl}">Chiffres clés 2026</a><a href="/path/to/my/file.pdf">bruit</a></html>`, 'hebergements-locatifs': `<html>${known}</html>`, 'audiar.org': `<html>${known}</html>` };
    const h0 = treeHash(root, ['dist', 'data/market', 'data/raw']);
    const r = await runRefresh({ root, today: TODAY, runTests: false, fetchImpl: fakeFetch({ pages }) });
    assert.equal(r.publications.pending.length, 1);
    assert.equal(r.publications.pending[0].url, newUrl);
    assert.ok(r.alerts.some((a) => a.kind === 'NOUVELLE PUBLICATION À VÉRIFIER'));
    assert.match(toMarkdown(r), /NOUVELLE PUBLICATION À VÉRIFIER/);
    assert.equal(r.decision, 'NO_CHANGE');
    assert.equal(treeHash(root, ['dist', 'data/market', 'data/raw']), h0, 'la base de calcul ne doit pas changer');
    const inbox = JSON.parse(fs.readFileSync(path.join(root, 'data/inbox/publications.json'), 'utf8'));
    assert.equal(inbox.detected[0].status, 'À VÉRIFIER');
    assert.ok(inbox.detected[0].localCopy.startsWith('data/inbox/pdf/'));
    assert.ok(ignoreMatcher(root)(inbox.detected[0].localCopy), 'le PDF doit rester hors du dépôt');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A15. Extraction des liens PDF : adresses absolues, relatives, bruit ignoré par le filtre de la page', () => {
  const html = '<a href="/app/uploads/x/2026_Bilan.pdf">a</a> <a href=\'https://www.audiar.org/wp-content/uploads/2027/07/Doc_obs_Tourisme_2026.pdf\'>b</a>';
  const links = extractPdfLinks(html, 'https://www.ille-et-vilaine-tourisme.bzh/acteurs/');
  assert.ok(links.includes('https://www.ille-et-vilaine-tourisme.bzh/app/uploads/x/2026_Bilan.pdf'));
  const audiar = AUTO.publications.pages.find((p) => p.id === 'audiar_tourisme');
  assert.ok(new RegExp(audiar.match, 'i').test('https://www.audiar.org/wp-content/uploads/2027/07/Doc_obs_Tourisme_2026.pdf'));
  assert.ok(!new RegExp(audiar.match, 'i').test('https://www.audiar.org/path/to/my/file.pdf'));
});

test('A16. Restauration : liste des versions, version active archivée avant remplacement, version vide refusée', () => {
  const root = tmpRepo();
  try {
    const dir = path.join(root, 'data/history/market-versions');
    fs.mkdirSync(dir, { recursive: true });
    const n0 = listVersions(root).length;
    const old = clone(MARKET);
    old.generatedAt = '2025-05-01T00:00:00.000Z';
    fs.writeFileSync(path.join(dir, 'market-2025-05-01T00-00-00-000Z.json'), JSON.stringify(old));
    fs.writeFileSync(path.join(dir, 'market-empty.json'), JSON.stringify({ generatedAt: 'x', markets: {} }));
    assert.throws(() => restoreVersion('data/history/market-versions/market-empty.json', root), /vide/);
    fs.rmSync(path.join(dir, 'market-empty.json'));
    const r = restoreVersion('data/history/market-versions/market-2025-05-01T00-00-00-000Z.json', root);
    assert.ok(fs.existsSync(r.archivedActive));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'dist/market.json'), 'utf8')).generatedAt, old.generatedAt);
    assert.equal(listVersions(root).length, n0 + 2, 'version restaurée + version active archivée');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---------- Sécurité, alertes, workflow ----------

test('A17. Sécurité : dépôt propre ; jeton, données Émeraude, données Inside Airbnb ou PDF publiables détectés', () => {
  assert.deepEqual(runSecurityCheck(ROOT).issues, []);
  const root = tmpRepo();
  try {
    fs.writeFileSync(path.join(root, 'scripts/oops.mjs'), `const token = "ghp_${'a'.repeat(36)}";`);
    fs.writeFileSync(path.join(root, 'data/listings_monthly.csv'), 'listing_ref\nEM-1');
    fs.writeFileSync(path.join(root, 'reports/listings.csv.gz'), 'x');
    fs.writeFileSync(path.join(root, 'reports/doc.pdf'), '%PDF');
    fs.writeFileSync(path.join(root, 'data/emeraude/private/listings_monthly.csv'), 'listing_ref\nEM-1'); // exclu : ne doit PAS être signalé comme publiable
    const issues = runSecurityCheck(root).issues.join('\n');
    assert.match(issues, /oops\.mjs : jeton GitHub/);
    assert.match(issues, /data\/listings_monthly\.csv : donnée brute Émeraude/);
    assert.match(issues, /listings\.csv\.gz : donnée brute Inside Airbnb/);
    assert.match(issues, /doc\.pdf/);
    assert.doesNotMatch(issues, /emeraude\/private/);
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
    assert.match(runSecurityCheck(root).issues.join('\n'), /n'est plus exclu/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A18. Le contrôle de sécurité bloque l\'actualisation (aucune activation, statut ERROR)', async () => {
  const root = tmpRepo();
  try {
    fs.writeFileSync(path.join(root, 'scripts/oops.mjs'), `const token = "ghp_${'b'.repeat(36)}";`);
    const r = await runRefresh(opts(root, { fetchImpl: fakeFetch() }));
    assert.equal(r.status, 'ERROR');
    assert.equal(r.promoted, false);
    assert.ok(r.alerts.some((a) => a.kind === 'sécurité'));
    assert.ok(!JSON.stringify(r).includes('b'.repeat(36)), 'le secret ne doit jamais apparaître dans le rapport');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A19. Alertes : aucune si tout va bien ; même alerte → même clé (pas de relance inutile)', () => {
  const rep = { status: 'WARNING', decision: 'NO_CHANGE', startedAt: '2026-10-05T05:23:00Z', alerts: [{ kind: 'NOUVELLE PUBLICATION À VÉRIFIER', msg: 'Chiffres clés 2026 — https://x/y.pdf (détectée le 05/10/2026). Aucune modification.' }] };
  const a = alertBody(rep);
  const b = alertBody({ ...rep, startedAt: '2026-10-12T05:23:00Z', alerts: [{ ...rep.alerts[0], msg: rep.alerts[0].msg.replace('05/10/2026', '12/10/2026') }] });
  assert.equal(a.key, b.key);
  assert.match(a.body, /NOUVELLE PUBLICATION À VÉRIFIER/);
  assert.notEqual(alertBody({ ...rep, alerts: [{ kind: 'fraîcheur', msg: 'LOW' }] }).key, a.key);
});

test('A20. Workflow GitHub Actions : planifié + manuel (simulation), sans secret, sécurité, tests, artefact, alerte, échec propre', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/data-refresh.yml'), 'utf8');
  assert.match(wf, new RegExp(`cron: '${AUTO.schedule.cron.replace(/\*/g, '\\*')}'`));
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /dry_run:/);
  assert.match(wf, /node scripts\/security-check\.mjs/);
  assert.match(wf, /node scripts\/refresh\.mjs/);
  assert.match(wf, /npm test/);
  assert.match(wf, /actions\/upload-artifact@v4/);
  assert.match(wf, /scripts\/ci\/alert-issue\.mjs/);
  assert.match(wf, /exit 1/);
  assert.doesNotMatch(wf, /secrets\./, 'aucun secret ne doit être nécessaire');
  assert.doesNotMatch(wf, /emeraude:aggregate|aggregate-emeraude|data\/emeraude\/private/, 'les données Émeraude ne doivent jamais être traitées par le workflow');
  assert.doesNotMatch(wf, /--force-accept/, 'un REJECT ne doit jamais être validé automatiquement');
  assert.ok(!fs.existsSync(path.join(ROOT, '.github/workflows/update-data.yml')), 'ancien workflow concurrent');
  const pkg = J('package.json');
  assert.equal(pkg.scripts['data:update'], 'node scripts/refresh.mjs');
  assert.equal(pkg.scripts.update, 'npm run data:update');
});

test('A21. Données Émeraude : aucune recalibration automatique (aucun agrégat, coefficients inchangés)', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'data/emeraude/aggregates.json')));
  assert.deepEqual(MARKET.emeraude.segments, []);
  const src = fs.readFileSync(path.join(ROOT, 'scripts/refresh.mjs'), 'utf8');
  assert.doesNotMatch(src, /aggregate-emeraude|config\.json['"]\s*,\s*(?!.*readFile)/);
  assert.doesNotMatch(src, /wr\([^)]*config\//, 'l\'actualisation ne doit jamais écrire la configuration');
});

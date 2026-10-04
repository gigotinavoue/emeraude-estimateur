// Actualisation automatique des données (npm run data:update [-- --dry-run]).
//
// Principe : FIABILITÉ > RÉCENCE > AUTOMATISATION. Les données ACTIVES ne sont jamais modifiées directement.
//  1. récupération des sources automatiques (Eurostat, Insee) et contrôle de chaque réponse ;
//  2. surveillance des publications annuelles (signalées, jamais intégrées) ;
//  3. sans nouvelle période ni changement manuel : arrêt, rien n'est reconstruit ni écrit ;
//  4. sinon : copie du dépôt dans une zone de préparation, intégration, reconstruction complète, tests ;
//  5. comparaison avec la version active (marchés, saisonnalité, 8 logements de référence) → ACCEPT / REVIEW / REJECT ;
//  6. ACCEPT ou REVIEW : la version active est archivée puis remplacée ; REJECT : la version active est conservée ;
//  7. rapport (out/refresh-report.md|json) et alertes uniquement si une intervention est nécessaire.
//
// Options : --dry-run (aucune écriture des données actives), --no-fetch (reconstruit à partir des fichiers présents,
// ex. après une saisie annuelle), --force (reconstruit même sans changement), --skip-publications,
// --force-accept (validation humaine d'un REJECT, jamais utilisée par le workflow), --today=AAAA-MM-JJ, --keep-staging.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/util.mjs';
import { fetchSource, lastPeriod } from './lib/fetch-sources.mjs';
import { checkSource, compareMarkets, compareReferences, worst, lagMonths } from './lib/refresh-core.mjs';
import { referenceProperties } from './audit/reference-properties.mjs';
import { dataStatus } from './check-freshness.mjs';
import { detectPublications } from './detect-publications.mjs';
import { runSecurityCheck } from './security-check.mjs';

const rd = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const rdIf = (root, rel) => (fs.existsSync(path.join(root, rel)) ? rd(root, rel) : null);
const wr = (root, rel, data) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', 'utf8');
};
const stampOf = (iso) => String(iso).replace(/[:.]/g, '-');
const fr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

// Fichiers dont le contenu détermine market.json : leur empreinte permet de détecter une saisie manuelle (ex. epci_2025.csv).
const INPUT_GLOBS = [/^data\/raw\/[^/]+\/[^/]+\.(csv|json)$/, /^data\/raw\/manifest\.json$/, /^config\/(config|communes|sources)\.json$/];
export function inputsFingerprint(root) {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'archive') walk(rel); } else if (INPUT_GLOBS.some((re) => re.test(rel))) files.push(rel);
    }
  };
  walk('data/raw');
  walk('config');
  const map = {};
  for (const f of files.sort()) {
    let content = fs.readFileSync(path.join(root, f), 'utf8');
    if (/^data\/raw\/(eurostat|insee)\//.test(f)) { const j = JSON.parse(content); content = JSON.stringify(j.data); } // la date de récupération seule ne compte pas
    map[f] = crypto.createHash('sha256').update(content).digest('hex');
  }
  return map;
}

export function copyRepo(root, dest) {
  const skip = (rel) => /^(\.git|node_modules|out|data\/inbox\/pdf|tests\/tmp-[^/]*)(\/|$)/.test(rel) || /^data\/emeraude\/private\/.+/.test(rel);
  fs.cpSync(root, dest, { recursive: true, filter: (src) => !skip(path.relative(root, src).split(path.sep).join('/')) });
}

function run(dir, script, args = [], env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function parseTestCounts(out) {
  const n = (k) => { const m = new RegExp(`ℹ ${k} (\\d+)`).exec(out); return m ? Number(m[1]) : null; };
  return { total: n('tests'), pass: n('pass'), fail: n('fail') };
}

const PROMOTE = ['data/raw/eurostat', 'data/raw/insee', 'data/observations', 'data/market', 'data/history', 'dist', 'embed/estimateur-v2.html', 'deploy/estimateur-v2/estimateur-v2-validation.html', 'reports/preview-artifact.html'];

export async function runRefresh(opts = {}) {
  const {
    root = ROOT, dryRun = false, noFetch = false, force = false, forceAccept = false, skipPublications = false,
    today = new Date(), fetchImpl, runTests = true, keepStaging = false, retryDelayMs = 1500
  } = opts;
  const automation = rd(root, 'config/automation.json');
  const config = rd(root, 'config/config.json');
  const communes = rd(root, 'config/communes.json');
  const now = new Date();
  const report = { startedAt: now.toISOString(), today: today.toISOString().slice(0, 10), mode: dryRun ? 'dry-run' : 'réel', sources: [], publications: { pages: [], pending: [] }, rebuild: null, market: [], references: [], tests: null, decision: null, status: null, promoted: false, alerts: [], notes: [] };
  const alert = (kind, msg) => report.alerts.push({ kind, msg });
  let staging = null;

  try {
    // 0. Sécurité.
    const sec = runSecurityCheck(root);
    report.security = { files: sec.files, issues: sec.issues };
    if (sec.issues.length) {
      alert('sécurité', `Contrôle de sécurité en échec : ${sec.issues.join(' ; ')}`);
      report.decision = 'REJECT';
      report.status = 'ERROR';
      return finish(root, report, { dryRun });
    }

    // 1. Sources automatiques.
    const health = rdIf(root, 'data/history/source-health.json') || { sources: {}, publications: {} };
    const newHealth = JSON.parse(JSON.stringify(health));
    const candidates = {};
    for (const [id, src] of Object.entries(automation.sources)) {
      const prev = rdIf(root, src.file);
      const row = { id, label: src.label, role: src.role, previousPeriod: prev ? prev.lastPeriod || lastPeriod(prev.data) : null };
      report.sources.push(row);
      const h = (newHealth.sources[id] = newHealth.sources[id] || { consecutiveFailures: 0 });
      if (noFetch) { row.status = 'NOT_FETCHED'; row.level = 'ACCEPT'; continue; }
      let cand;
      try {
        const { url, data } = await fetchSource(src, { today, fetchImpl, retryDelayMs });
        cand = { retrievedAt: new Date().toISOString(), url, describe: src.describe, lastPeriod: lastPeriod(data), data };
      } catch (e) {
        row.status = 'UNAVAILABLE';
        row.level = 'ACCEPT';
        row.error = e.message;
        h.consecutiveFailures += 1;
        h.lastFailureAt = now.toISOString();
        h.lastError = e.message;
        if (h.consecutiveFailures >= automation.alerts.sourceUnavailableConsecutiveRuns) alert('source indisponible', `${src.label} indisponible depuis ${h.consecutiveFailures} exécutions consécutives (${e.message}). Version précédente conservée : ${row.previousPeriod}.`);
        continue;
      }
      if (h.consecutiveFailures) { h.consecutiveFailures = 0; delete h.lastError; }
      const chk = checkSource(src, cand, prev, today);
      Object.assign(row, { status: chk.status, level: chk.level, newPeriod: chk.lastPeriod, issues: chk.issues, maxRevision: chk.maxRevision, observations: chk.observations });
      if (chk.level === 'REJECT') {
        h.lastRejectedAt = now.toISOString();
        if (automation.alerts.onReject) alert('donnée invalide', `${src.label} : réponse refusée (${chk.issues.filter((i) => i.level === 'REJECT').map((i) => i.msg).join(' ; ')}). Version précédente conservée : ${row.previousPeriod}.`);
      } else if (chk.status === 'NEW_PERIOD' || chk.status === 'REVISION') {
        candidates[id] = { src, cand, prev, chk };
        if (chk.level === 'REVIEW' && automation.alerts.onReview) alert('variation à vérifier', `${src.label} : ${chk.issues.map((i) => i.msg).join(' ; ')}`);
      }
      const activePeriod = chk.level === 'REJECT' ? row.previousPeriod : chk.lastPeriod;
      const lag = lagMonths(activePeriod, today);
      row.lagMonths = lag;
      if (automation.alerts.onSourceStale && lag !== null && lag > src.maxLagMonths) alert('source figée', `${src.label} : dernière période ${activePeriod}, soit ${lag} mois (attendu ≤ ${src.maxLagMonths}).`);
    }

    // 2. Publications annuelles (jamais intégrées).
    if (!skipPublications && !noFetch) {
      const pub = await detectPublications({ root, automation, fetchImpl, write: !dryRun, now });
      report.publications = { pages: pub.pages, pending: pub.pending.map((p) => ({ label: p.label, url: p.url, firstSeenAt: p.firstSeenAt, impact: p.impact })) };
      for (const p of pub.pages) {
        const h = (newHealth.publications[p.id] = newHealth.publications[p.id] || { consecutiveFailures: 0 });
        if (p.ok) h.consecutiveFailures = 0;
        else {
          h.consecutiveFailures += 1;
          if (h.consecutiveFailures >= automation.alerts.sourceUnavailableConsecutiveRuns) alert('page de publication inaccessible', `${p.id} inaccessible depuis ${h.consecutiveFailures} exécutions (${p.error}).`);
        }
      }
      if (pub.pending.length && automation.alerts.onNewPublication) for (const p of pub.pending) alert('NOUVELLE PUBLICATION À VÉRIFIER', `${p.label} — ${p.url} (détectée le ${fr(p.firstSeenAt)}). Aucune modification de la base de calcul n'est effectuée automatiquement.`);
    }

    // 3. Faut-il reconstruire ?
    const fp = inputsFingerprint(root);
    const lastInputs = rdIf(root, 'data/history/build-inputs.json');
    const manualChanges = lastInputs ? Object.keys({ ...fp, ...lastInputs.files }).filter((k) => fp[k] !== lastInputs.files[k] && !/^data\/raw\/(eurostat|insee)\//.test(k)) : [];
    if (manualChanges.length) report.notes.push(`Fichiers modifiés depuis la dernière construction acceptée : ${manualChanges.join(', ')}`);
    const needBuild = Object.keys(candidates).length > 0 || manualChanges.length > 0 || force;
    report.rebuild = { needed: needBuild, reasons: [...Object.keys(candidates).map((k) => `${k} : ${candidates[k].chk.status}`), ...manualChanges.map((f) => `saisie : ${f}`), ...(force ? ['--force'] : [])] };

    const active = rd(root, 'dist/market.json');
    let finalMarket = active;
    if (!needBuild) {
      report.decision = 'NO_CHANGE';
    } else {
      // 4. Zone de préparation.
      staging = fs.mkdtempSync(path.join(os.tmpdir(), 'emeraude-refresh-'));
      copyRepo(root, staging);
      for (const { src, cand, prev, chk } of Object.values(candidates)) {
        if (prev) {
          const tag = chk.status === 'NEW_PERIOD' ? prev.lastPeriod || lastPeriod(prev.data) : `${chk.lastPeriod}.revision-${stampOf(prev.retrievedAt || now.toISOString())}`;
          const archive = src.file.replace(/([^/]+)\.json$/, `archive/$1.${tag}.json`);
          if (!fs.existsSync(path.join(staging, archive))) wr(staging, archive, prev);
        }
        wr(staging, src.file, cand);
      }
      const env = { ESTIMATEUR_TODAY: today.toISOString() };
      const steps = [['scripts/normalize.mjs'], ['scripts/validate.mjs'], ['scripts/build-market.mjs'], ['scripts/history-market.mjs'], ['scripts/check-freshness.mjs'], ['scripts/build-embed.mjs']];
      const pipeline = [];
      for (const [s] of steps) {
        const r = run(staging, s, [], env);
        pipeline.push({ step: s, ok: r.ok });
        if (!r.ok) {
          report.pipeline = pipeline;
          report.decision = 'REJECT';
          alert('pipeline bloqué', `Étape ${s} en échec : ${r.out.trim().split('\n').slice(-5).join(' | ')}`);
          return finish(root, report, { dryRun, staging, keepStaging, newHealth });
        }
      }
      report.pipeline = pipeline;
      const vr = rdIf(staging, 'data/observations/validation-report.json');
      if (vr && (vr.rejected.length || vr.keptPrevious.length)) report.notes.push(`Validation : ${vr.rejected.length} rejet(s), ${vr.keptPrevious.length} valeur(s) précédente(s) conservée(s).`);

      // 5. Comparaisons.
      const cand = rd(staging, 'dist/market.json');
      report.market = compareMarkets(active, cand, automation.thresholds, config.validation);
      const before = referenceProperties(active, today);
      const after = referenceProperties(cand, today);
      report.references = compareReferences(before, after, automation.thresholds);
      wr(staging, 'data/history/reference-accepted.json', { acceptedAt: now.toISOString(), computedFor: today.toISOString().slice(0, 10), marketGeneratedAt: cand.generatedAt, properties: after });

      // 6. Tests dans la zone de préparation (moteur + pipeline + invariants).
      if (runTests) {
        const t = spawnSync(process.execPath, ['--test', 'tests/*.test.mjs'], { cwd: staging, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        report.tests = { ...parseTestCounts((t.stdout || '') + (t.stderr || '')), ok: t.status === 0 };
        if (!report.tests.ok) {
          const failed = ((t.stdout || '').match(/^✖ .+$/gm) || []).slice(0, 5);
          alert('tests en échec', `Tests en échec dans la zone de préparation : ${failed.join(' | ')}`);
        }
      }

      const levels = [...Object.values(candidates).map((c) => c.chk.level), ...report.market.map((c) => c.level), ...report.references.map((r) => r.level), ...(report.tests && !report.tests.ok ? ['REJECT'] : [])];
      report.decision = worst(levels);
      for (const c of report.market.filter((x) => x.level !== 'ACCEPT')) if (c.level === 'REJECT' || automation.alerts.onReview) alert(c.level === 'REJECT' ? 'variation anormale' : 'variation à vérifier', `${c.scope} : ${c.msg}`);
      for (const r of report.references.filter((x) => x.level !== 'ACCEPT')) alert(r.level === 'REJECT' ? 'variation anormale' : 'variation à vérifier', `${r.label} : CA ${r.before.nightsRevenue} → ${r.after ? r.after.nightsRevenue : '—'} € (${r.revenuePct} %)${r.notes.length ? ' — ' + r.notes.join(' ; ') : ''}`);

      // 7. Activation.
      const blocked = report.decision === 'REJECT' && !forceAccept;
      if (report.decision === 'REJECT' && forceAccept) report.notes.push('REJECT validé manuellement (--force-accept).');
      if (!dryRun && !blocked) {
        promote(root, staging, active, now);
        report.promoted = true;
        finalMarket = cand;
      } else if (blocked) {
        report.notes.push('Activation bloquée : la version active est conservée.');
      }
      if (!dryRun && !blocked) wr(root, 'data/history/build-inputs.json', { at: now.toISOString(), files: inputsFingerprint(root) });
    }

    // 8. Fraîcheur (sur la version active après décision).
    const st = dataStatus({ market: finalMarket, communes, config, today });
    report.freshness = { global: st.globalDataConfidence, marketDataYear: st.marketDataYear, families: st.families.map((f) => ({ id: f.id, label: f.label, status: f.status, newestEnd: f.periods.newestEnd })) };
    const marketFam = st.families.find((f) => f.id === 'market');
    if (automation.alerts.onFreshness.includes(marketFam.status) || automation.alerts.onFreshness.includes(st.globalDataConfidence)) alert('fraîcheur', `Fraîcheur ${st.globalDataConfidence} : données de marché ${st.marketDataYear}. Une nouvelle publication annuelle doit être intégrée (docs/procedure-donnees-annuelles.md).`);
    report.baseNote = Object.values(finalMarket.markets).every((m) => m.period.end === Object.values(active.markets)[0].period.end) ? `base ${st.marketDataYear} inchangée` : `base actualisée : ${st.marketDataYear}`;

    return finish(root, report, { dryRun, staging, keepStaging, newHealth, health });
  } catch (e) {
    report.decision = 'REJECT';
    report.status = 'ERROR';
    alert('pipeline bloqué', `Erreur inattendue : ${e.message}`);
    return finish(root, report, { dryRun, staging, keepStaging });
  }
}

function promote(root, staging, active, now) {
  // Archive de la version active avant remplacement (jamais de suppression).
  const mv = `data/history/market-versions/market-${stampOf(active.generatedAt)}.json`;
  if (!fs.existsSync(path.join(root, mv))) wr(root, mv, active);
  const ref = rdIf(root, 'data/history/reference-accepted.json');
  if (ref) {
    const rv = `data/history/reference-versions/reference-${stampOf(ref.acceptedAt)}.json`;
    if (!fs.existsSync(path.join(root, rv))) wr(root, rv, ref);
  }
  // Copie par fusion : les fichiers absents de la zone de préparation (archives) ne sont jamais supprimés.
  for (const rel of PROMOTE) {
    const src = path.join(staging, rel);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(root, rel), { recursive: true, force: true });
  }
  fs.appendFileSync(path.join(root, 'data/history/updates.jsonl'), JSON.stringify({ at: now.toISOString(), kind: 'promotion', archivedMarket: mv }) + '\n');
}

function finish(root, report, { dryRun, staging, keepStaging, newHealth, health } = {}) {
  if (staging && !keepStaging) fs.rmSync(staging, { recursive: true, force: true });
  else if (staging) report.stagingDir = staging;
  if (!report.status) {
    const unavailable = report.sources.some((s) => s.status === 'UNAVAILABLE');
    const rejectedSource = report.sources.some((s) => s.level === 'REJECT');
    if (report.decision === 'REJECT' && !report.promoted) report.status = 'BLOCKED';
    else if (report.decision === 'REVIEW' || unavailable || rejectedSource || report.alerts.length) report.status = 'WARNING';
    else report.status = 'OK';
    if (rejectedSource && report.status === 'OK') report.status = 'WARNING';
  }
  report.needsAttention = report.alerts.length > 0;
  report.needsReview = report.decision === 'REVIEW' || report.decision === 'REJECT';
  report.finishedAt = new Date().toISOString();
  // État des sources : écrit seulement s'il change réellement (pas de commit hebdomadaire inutile).
  const strip = (h) => JSON.stringify(Object.fromEntries(['sources', 'publications'].map((g) => [g, Object.fromEntries(Object.entries((h && h[g]) || {}).filter(([, v]) => v.consecutiveFailures || v.lastRejectedAt))])));
  if (!dryRun && newHealth && strip(newHealth) !== strip(health)) wr(root, 'data/history/source-health.json', newHealth);
  const md = toMarkdown(report);
  wr(root, 'out/refresh-report.json', report);
  wr(root, 'out/refresh-report.md', md);
  if (!dryRun && (report.promoted || report.alerts.length)) wr(root, `data/history/refresh-reports/${report.startedAt.slice(0, 10)}-${stampOf(report.startedAt).slice(11, 19)}.md`, md);
  return report;
}

const ICON = { NEW_PERIOD: '✓', REVISION: '✓', UNCHANGED: '=', UNAVAILABLE: '✗', REJECTED: '✗', NOT_FETCHED: '·' };
export function toMarkdown(r) {
  const L = [];
  L.push(`# DATA REFRESH — ${fr(r.startedAt)}${r.mode === 'dry-run' ? ' (simulation : aucune donnée active modifiée)' : ''}`, '');
  L.push(`**Statut : ${r.status}**${r.status === 'WARNING' && !r.promoted && r.decision !== 'REJECT' ? ' — aucune donnée perdue' : ''} · décision : ${r.decision}${r.promoted ? ' · nouvelle version activée' : ''}${r.needsReview ? ' · NEEDS_REVIEW=true' : ''}`, '');
  L.push('## Sources automatiques', '', '| Source | Période active | Période reçue | Résultat | Détail |', '|---|---|---|---|---|');
  for (const s of r.sources) {
    const res = { NEW_PERIOD: 'nouvelle période', REVISION: 'révision', UNCHANGED: 'aucune nouvelle période', UNAVAILABLE: 'source indisponible — version précédente conservée', REJECTED: 'réponse refusée — version précédente conservée', NOT_FETCHED: 'non interrogée' }[s.status] || s.status;
    const det = [...(s.issues || []).map((i) => `${i.level} : ${i.msg}`), s.error ? `erreur : ${s.error}` : '', s.maxRevision && s.maxRevision.value ? `révision max ${s.maxRevision.value} ${s.maxRevision.unit}` : ''].filter(Boolean).join(' ; ');
    L.push(`| ${s.label} | ${s.previousPeriod || '—'} | ${s.newPeriod || '—'} | ${ICON[s.status] || ''} ${res}${s.level && s.status !== 'UNAVAILABLE' && s.status !== 'NOT_FETCHED' ? ` (${s.level})` : ''} | ${det || '—'} |`);
  }
  L.push('', '## Marché', '');
  if (!r.rebuild || !r.rebuild.needed) L.push(`→ aucune reconstruction (aucune nouvelle période, aucune saisie) ; ${r.baseNote || 'base inchangée'}.`);
  else {
    L.push(`→ reconstruction : ${r.rebuild.reasons.join(', ')}`);
    if (r.baseNote) L.push(`→ ${r.baseNote}`);
    const notable = r.market.filter((c) => c.level !== 'ACCEPT' || /profil actualisé/.test(c.msg));
    for (const c of notable) L.push(`- ${c.level} · ${c.scope} : ${c.msg}`);
    if (!notable.length) L.push('- prix, occupation, séjour moyen et profils saisonniers : inchangés');
  }
  L.push('- aucune donnée EPCI plus récente n\'est intégrée automatiquement (publication annuelle = validation humaine)');
  if (r.references.length) {
    L.push('', '## Logements de référence (même date de calcul, seules les données changent)', '', '| Logement | CA avant | CA après | Variation | Prix | Occupation | Décision |', '|---|---|---|---|---|---|---|');
    for (const x of r.references) L.push(`| ${x.label} | ${x.before.nightsRevenue} € | ${x.after ? x.after.nightsRevenue + ' €' : '—'} | ${x.revenuePct ?? '—'} %${x.signal ? ' (signalée)' : ''} | ${x.adrPct ?? '—'} % | ${x.occupancyPts ?? '—'} pts | ${x.level} |`);
    const anyMove = r.references.some((x) => x.revenuePct);
    if (!anyMove) L.push('', '✓ aucune variation');
  }
  if (r.tests) L.push('', '## Tests', '', `${r.tests.ok ? '✓' : '✗'} ${r.tests.pass}/${r.tests.total}${r.tests.fail ? ` — ${r.tests.fail} échec(s)` : ''}`);
  if (r.publications && r.publications.pages && r.publications.pages.length) {
    L.push('', '## Publications annuelles', '');
    if (r.publications.pending.length) for (const p of r.publications.pending) L.push(`⚠️ NOUVELLE PUBLICATION À VÉRIFIER — ${p.label}`, `   ${p.url}`, '   Aucune modification de la base de calcul n\'est effectuée automatiquement.');
    else L.push('Aucune nouvelle publication.');
    for (const p of r.publications.pages.filter((x) => !x.ok)) L.push(`- page ${p.id} inaccessible : ${p.error}`);
  }
  if (r.freshness) L.push('', '## Fraîcheur', '', `Confiance « données » : ${r.freshness.global} · données de marché : ${r.freshness.marketDataYear}`, ...r.freshness.families.map((f) => `- ${f.label} : ${f.status} (fin ${f.newestEnd})`));
  L.push('', '## Alertes', '');
  if (r.alerts.length) for (const a of r.alerts) L.push(`- **${a.kind}** : ${a.msg}`);
  else L.push('Aucune intervention nécessaire.');
  if (r.notes.length) L.push('', '## Notes', '', ...r.notes.map((n) => `- ${n}`));
  return L.join('\n') + '\n';
}

export function printSummary(r) {
  console.log(toMarkdown(r));
}

if (process.argv[1].endsWith('refresh.mjs')) {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const t = args.find((a) => a.startsWith('--today='));
  const r = await runRefresh({ dryRun: has('--dry-run'), noFetch: has('--no-fetch'), force: has('--force'), forceAccept: has('--force-accept'), skipPublications: has('--skip-publications'), keepStaging: has('--keep-staging'), today: t ? new Date(`${t.slice(8)}T12:00:00Z`) : new Date() });
  printSummary(r);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${r.status}\ndecision=${r.decision}\npromoted=${r.promoted}\nneeds_attention=${r.needsAttention}\nneeds_review=${r.needsReview}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, toMarkdown(r));
  process.exitCode = r.status === 'ERROR' ? 1 : r.status === 'BLOCKED' ? 2 : 0;
}

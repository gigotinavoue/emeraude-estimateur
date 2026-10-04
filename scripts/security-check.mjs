// Contrôle de sécurité avant toute publication ou tout commit automatique.
// Échoue si un fichier publiable contient un secret, une donnée privée Émeraude, une donnée brute Inside Airbnb
// ou un document dont la licence n'autorise pas la redistribution (PDF).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/util.mjs';

// Lecture simplifiée de .gitignore (motifs utilisés par ce dépôt : « dossier/ », « dossier/* », « !exception », « nom »).
export function ignoreMatcher(root) {
  const file = path.join(root, '.gitignore');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  const toRe = (pat) => {
    let p = pat.replace(/^\//, '');
    const dir = p.endsWith('/');
    if (dir) p = p.slice(0, -1);
    const body = p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
    const anchored = p.includes('/') ? `^${body}` : `(^|/)${body}`;
    return new RegExp(`${anchored}${dir ? '(/|$)' : '($|/)'}`);
  };
  const rules = lines.map((l) => (l.startsWith('!') ? { neg: true, re: toRe(l.slice(1)) } : { neg: false, re: toRe(l) }));
  return (rel) => {
    let ignored = false;
    for (const r of rules) if (r.re.test(rel)) ignored = !r.neg;
    return ignored;
  };
}

export function publishableFiles(root = ROOT) {
  const ignored = ignoreMatcher(root);
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.name === '.git' || e.name === 'node_modules') continue;
      if (ignored(rel)) continue;
      if (e.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('');
  return out;
}

const SECRET_PATTERNS = [
  ['jeton GitHub', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['clé AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['clé privée', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['clé d\'API Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['jeton Slack', /\bxox[abpr]-[0-9A-Za-z-]{10,}\b/],
  ['jeton Bearer en clair', /\bBearer\s+[A-Za-z0-9._-]{30,}/],
  ['clé, mot de passe ou secret affecté en clair', /\b(api[_-]?key|apikey|secret|password|passwd|mot_de_passe|token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i]
];
const PRIVATE_NAMES = [
  ['donnée brute Émeraude', /(^|\/)listings_monthly\.csv$/],
  ['donnée brute Émeraude', /^data\/emeraude\/private\/(?!\.gitkeep$)/],
  ['donnée brute Inside Airbnb', /(^|\/)(listings|calendar|reviews)(\.csv|\.csv\.gz|\.geojson)$/],
  ['document PDF (licence de redistribution non établie)', /\.pdf$/i],
  ['fichier d\'environnement', /(^|\/)\.env(\.|$)/]
];

export function runSecurityCheck(root = ROOT) {
  const issues = [];
  const files = publishableFiles(root);
  for (const rel of files) {
    for (const [label, re] of PRIVATE_NAMES) if (re.test(rel)) issues.push(`${rel} : ${label}`);
    const full = path.join(root, rel);
    const size = fs.statSync(full).size;
    if (size > 5 * 1024 * 1024 || !/\.(m?js|json|ya?ml|md|html|csv|txt|jsonl)$|^\.gitignore$/i.test(rel)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) issues.push(`${rel} : ${label}`);
  }
  // Le dossier privé doit rester exclu.
  const ignored = ignoreMatcher(root);
  if (!ignored('data/emeraude/private/listings_monthly.csv')) issues.push('.gitignore : data/emeraude/private/ n\'est plus exclu');
  if (fs.existsSync(path.join(root, 'data/emeraude/aggregates.json'))) {
    const agg = JSON.parse(fs.readFileSync(path.join(root, 'data/emeraude/aggregates.json'), 'utf8'));
    for (const s of agg.segments || []) if (!(s.listings >= 3)) issues.push(`data/emeraude/aggregates.json : segment ${s.key} de moins de 3 logements`);
  }
  return { files: files.length, issues };
}

if (process.argv[1].endsWith('security-check.mjs')) {
  const { files, issues } = runSecurityCheck();
  if (issues.length) {
    console.error(`Contrôle de sécurité : ${issues.length} problème(s) sur ${files} fichier(s) publiables.`);
    issues.forEach((i) => console.error('  - ' + i));
    process.exit(1);
  }
  console.log(`Contrôle de sécurité : OK (${files} fichiers publiables examinés ; aucun secret, aucune donnée privée, aucun PDF).`);
}

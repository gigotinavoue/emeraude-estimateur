// GitHub Actions uniquement : ouvre (ou complète) UNE issue « Données : intervention nécessaire » quand le rapport
// contient des alertes. Pas d'alerte → rien. Même contenu que la dernière alerte → rien (pas de relance inutile).
// Utilise le jeton automatique du workflow (GITHUB_TOKEN, permission issues: write) ; il n'est jamais affiché.
import fs from 'node:fs';
import crypto from 'node:crypto';

const TITLE = 'Données : intervention nécessaire';

export function alertBody(report) {
  const lines = report.alerts.map((a) => `- **${a.kind}** : ${a.msg}`);
  const key = crypto.createHash('sha256').update(report.alerts.map((a) => `${a.kind}|${a.msg.replace(/\(détectée le [^)]+\)/, '')}`).sort().join('\n')).digest('hex').slice(0, 16);
  return { key, body: `<!-- alert-key:${key} -->\n**Statut : ${report.status}** · décision : ${report.decision} · ${report.startedAt.slice(0, 10)}\n\n${lines.join('\n')}\n\nRapport complet : artefact « refresh-report » de l'exécution, ou \`out/refresh-report.md\` en local.\n\nQue faire : voir *reports/automation-data-refresh-2026-10.md → Instructions pour moi*.` };
}

async function gh(path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return r.json();
}

if (process.argv[1].endsWith('alert-issue.mjs')) {
  const report = JSON.parse(fs.readFileSync('out/refresh-report.json', 'utf8'));
  if (!report.alerts.length) {
    console.log('Aucune alerte : aucune issue.');
    process.exit(0);
  }
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.log('Hors GitHub Actions : alertes visibles dans out/refresh-report.md.');
    process.exit(0);
  }
  const { key, body } = alertBody(report);
  const open = (await gh('/issues?state=open&per_page=100')).find((i) => i.title === TITLE && !i.pull_request);
  if (!open) {
    await gh('/issues', { method: 'POST', body: JSON.stringify({ title: TITLE, body }) });
    console.log('Issue d\'alerte ouverte.');
  } else {
    const comments = await gh(`/issues/${open.number}/comments?per_page=100`);
    const last = [open.body || '', ...comments.map((c) => c.body || '')].pop();
    if (last.includes(`alert-key:${key}`)) console.log('Alerte identique déjà signalée : aucune relance.');
    else {
      await gh(`/issues/${open.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      console.log('Alerte ajoutée à l\'issue existante.');
    }
  }
}

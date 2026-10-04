// Détection des nouvelles publications annuelles (pages officielles listées dans config/automation.json).
// Un nouveau document n'est JAMAIS intégré : il est signalé « NOUVELLE PUBLICATION À VÉRIFIER » et noté dans
// data/inbox/publications.json. Le PDF est conservé en local dans data/inbox/pdf/ (exclu de Git : licence non établie).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getText } from './lib/fetch-sources.mjs';
import { ROOT } from './lib/util.mjs';

export function extractPdfLinks(html, baseUrl) {
  const out = new Set();
  for (const m of html.matchAll(/(?:href=["']?|["'(\s])((?:https?:)?\/?\/?[^"'\s<>()]+?\.pdf)(?=["'\s<>)?#]|$)/gi)) {
    try {
      out.add(new URL(m[1], baseUrl).href);
    } catch {
      /* lien illisible ignoré */
    }
  }
  return [...out];
}

export async function detectPublications({ root = ROOT, automation, fetchImpl, write = false, download = true, now = new Date() }) {
  const cfg = automation.publications;
  const known = new Set(cfg.known);
  const inboxFile = path.join(root, 'data/inbox/publications.json');
  const inbox = fs.existsSync(inboxFile) ? JSON.parse(fs.readFileSync(inboxFile, 'utf8')) : { note: 'Publications détectées automatiquement, en attente de vérification humaine. Aucune n\'est intégrée au calcul.', detected: [] };
  const pages = [];
  const pending = [];
  for (const page of cfg.pages) {
    try {
      const html = await getText(page.url, { fetchImpl });
      const re = new RegExp(page.match, 'i');
      const links = extractPdfLinks(html, page.url).filter((u) => re.test(u));
      pages.push({ id: page.id, ok: true, links: links.length });
      for (const url of links) {
        if (known.has(url)) continue;
        let rec = inbox.detected.find((d) => d.url === url);
        if (!rec) {
          rec = { url, pageId: page.id, label: page.label, impact: page.impact, firstSeenAt: now.toISOString(), status: 'À VÉRIFIER' };
          if (download && write) {
            try {
              const r = await (fetchImpl || fetch)(url);
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const buf = Buffer.from(await r.arrayBuffer());
              rec.bytes = buf.length;
              rec.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
              rec.isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
              const local = `data/inbox/pdf/${rec.sha256.slice(0, 12)}-${path.basename(new URL(url).pathname)}`;
              fs.mkdirSync(path.join(root, 'data/inbox/pdf'), { recursive: true });
              fs.writeFileSync(path.join(root, local), buf);
              rec.localCopy = local;
            } catch (e) {
              rec.downloadError = e.message;
            }
          }
          inbox.detected.push(rec);
        }
        if (rec.status === 'À VÉRIFIER') pending.push(rec);
      }
    } catch (e) {
      pages.push({ id: page.id, ok: false, error: e.message });
    }
  }
  const changed = write && pending.some((p) => p.firstSeenAt === now.toISOString());
  if (changed) {
    fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
    fs.writeFileSync(inboxFile, JSON.stringify(inbox, null, 2) + '\n', 'utf8');
  }
  return { pages, pending, written: changed };
}

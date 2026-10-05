import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const p = (...parts) => path.join(ROOT, ...parts);

export function readJson(rel) {
  return JSON.parse(fs.readFileSync(p(rel), 'utf8'));
}

export function readJsonIfExists(rel) {
  try {
    return readJson(rel);
  } catch {
    return null;
  }
}

export function writeJson(rel, data) {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function writeText(rel, text) {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), text, 'utf8');
}

// Génération stable des fichiers versionnés : un fichier n'est réécrit que si son contenu change réellement.
// render(builtAt) → { chemin: texte }. On réutilise d'abord l'horodatage de la génération précédente (lu dans le
// premier fichier) : si tout est identique (fins de ligne ignorées), rien n'est écrit et builtAt reste la date du
// dernier changement réel. Sinon, tout est régénéré avec l'heure actuelle.
export function stableBuild(files, render, { write = true, now = new Date() } = {}) {
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const read = (rel) => (fs.existsSync(p(rel)) ? fs.readFileSync(p(rel), 'utf8') : null);
  const prev = /"builtAt":"([^"]+)"/.exec(read(files[0]) || '');
  if (prev) {
    const out = render(prev[1]);
    if (files.every((rel) => { const cur = read(rel); return cur !== null && norm(cur) === norm(out[rel]); })) return { changed: false, builtAt: prev[1], out };
  }
  const builtAt = now.toISOString();
  const out = render(builtAt);
  if (write) for (const rel of files) writeText(rel, out[rel]);
  return { changed: true, builtAt, out };
}

// CSV simple (séparateur virgule, guillemets doubles), première ligne = en-têtes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function readCsv(rel) {
  return parseCsv(fs.readFileSync(p(rel), 'utf8').replace(/^﻿/, ''));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

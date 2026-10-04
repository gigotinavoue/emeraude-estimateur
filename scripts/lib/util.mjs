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

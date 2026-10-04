// Outil d'audit : extraction de texte d'un PDF dont les polices utilisent des chaînes hexadécimales
// avec tables ToUnicode (ex. exports InDesign). Lecture seule.
// Usage : node scripts/audit/pdf-text-cmap.mjs <fichier.pdf> [motif]
import fs from 'node:fs';
import zlib from 'node:zlib';

function streams(buf) {
  const out = [];
  let pos = 0;
  while (true) {
    const s = buf.indexOf('stream', pos, 'latin1');
    if (s < 0) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf('endstream', start, 'latin1');
    if (e < 0) break;
    pos = e + 9;
    if (e - start > 3_000_000) continue;
    try { out.push(zlib.inflateSync(buf.subarray(start, e)).toString('latin1')); } catch { /* flux non compressé ou image */ }
  }
  return out;
}

function parseCMap(txt, map) {
  for (const b of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(m[1].toUpperCase(), hexToUnicode(m[2]));
  }
  for (const b of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const dst = parseInt(m[3], 16);
      if (hi - lo > 5000) continue;
      for (let c = lo; c <= hi; c++) map.set(c.toString(16).toUpperCase().padStart(m[1].length, '0'), String.fromCodePoint(dst + (c - lo)));
    }
  }
}

function hexToUnicode(h) {
  let s = '';
  for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  return s;
}

export function pdfTextCMap(buf) {
  const all = streams(buf);
  const map = new Map();
  for (const t of all) if (t.includes('begincmap')) parseCMap(t, map);
  const lines = [];
  for (const t of all) {
    if (t.indexOf('BT') < 0) continue;
    let line = '';
    for (const m of t.matchAll(/<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^)\\])*)\)|\b(ET|T\*|Td|TD)\b/g)) {
      if (m[3]) { line += m[3] === 'ET' ? '\n' : ' '; continue; }
      if (m[1] !== undefined) {
        const h = m[1].replace(/\s/g, '').toUpperCase();
        for (let i = 0; i + 4 <= h.length; i += 4) line += map.get(h.slice(i, i + 4)) ?? '';
      } else line += m[2];
    }
    lines.push(line);
  }
  return lines.join('\n').replace(/[ \t]+/g, ' ');
}

if (process.argv[1].endsWith('pdf-text-cmap.mjs')) {
  const txt = pdfTextCMap(fs.readFileSync(process.argv[2]));
  const pat = process.argv[3];
  const ls = txt.split('\n').filter((l) => l.trim());
  if (!pat) console.log(ls.join('\n'));
  else ls.forEach((l, i) => { if (new RegExp(pat, 'i').test(l)) console.log(`[${i}] ${ls.slice(Math.max(0, i - 2), i + 5).join(' | ').slice(0, 800)}`); });
}

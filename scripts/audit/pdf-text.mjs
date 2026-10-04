// Outil d'audit : extraction rudimentaire du texte d'un PDF (flux FlateDecode, chaînes littérales des opérateurs Tj/TJ).
// Usage : node scripts/audit/pdf-text.mjs <fichier.pdf> [motif de recherche]
// Limites : ne décode pas les polices CID/hexadécimales ; le texte peut être incomplet.
import fs from 'node:fs';
import zlib from 'node:zlib';

function literals(dec) {
  // Parcours linéaire : collecte les chaînes entre parenthèses (avec échappements), ajoute un saut de ligne à chaque ET.
  let out = '';
  let depth = 0;
  let cur = '';
  for (let i = 0; i < dec.length; i++) {
    const c = dec[i];
    if (depth > 0) {
      if (c === '\\') { const n = dec[i + 1]; if (/[0-7]/.test(n)) { cur += String.fromCharCode(parseInt(dec.substr(i + 1, 3), 8)); i += 3; } else { cur += n; i++; } continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { out += cur; cur = ''; continue; } }
      cur += c;
    } else if (c === '(') depth = 1;
    else if (c === 'E' && dec[i + 1] === 'T' && /\s/.test(dec[i + 2] || ' ')) out += '\n';
  }
  return out;
}

export function pdfText(buf) {
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
    if (e - start > 2_000_000) continue;
    let dec;
    try { dec = zlib.inflateSync(buf.subarray(start, e)).toString('latin1'); } catch { continue; }
    if (dec.indexOf('BT') < 0) continue;
    const t = literals(dec).replace(/[ \t]+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out.join('\n');
}

if (process.argv[1].endsWith('pdf-text.mjs')) {
  const txt = pdfText(fs.readFileSync(process.argv[2]));
  const pat = process.argv[3];
  if (!pat) console.log(txt);
  else {
    const lines = txt.split('\n');
    const re = new RegExp(pat, 'i');
    lines.forEach((l, i) => { if (re.test(l)) console.log(`[${i}] ${lines.slice(Math.max(0, i - 2), i + 6).join(' | ').slice(0, 900)}`); });
    console.log(`(${lines.length} lignes extraites)`);
  }
}

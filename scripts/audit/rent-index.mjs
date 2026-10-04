// Audit (lecture seule) : loyers d'annonce 2025 (Carte des loyers, Licence Ouverte) pour les 16 communes.
// Sert à évaluer l'écart de niveau de prix entre communes d'une même intercommunalité et la dégressivité du prix au m².
import fs from 'node:fs';
import { p, readJson } from '../lib/util.mjs';

export function readRents(kind) {
  const [h, ...rows] = fs.readFileSync(p(`data/raw/carte-loyers/2025_${kind}_dep35.csv`), 'utf8').split('\n').filter(Boolean);
  const sep = h.includes(';') ? ';' : ',';
  const cols = h.split(sep).map((s) => s.replace(/"/g, ''));
  const out = {};
  for (const l of rows) {
    const v = l.split(sep).map((s) => s.replace(/"/g, ''));
    const o = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    out[o.INSEE_C] = { ...o, loypredm2: Number(String(o.loypredm2).replace(',', '.')), nbobs_com: Number(o.nbobs_com) };
  }
  return out;
}

export function rentTable() {
  const communes = readJson('config/communes.json').communes;
  const app = readRents('app');
  const a12 = readRents('app12');
  const a3 = readRents('app3');
  const mai = readRents('mai');
  return communes.map((c) => ({
    commune: c.label, insee: c.insee, epci: c.epci,
    app: app[c.insee].loypredm2, app12: a12[c.insee].loypredm2, app3: a3[c.insee].loypredm2, maison: mai[c.insee].loypredm2,
    typpred: a12[c.insee].TYPPRED, nbobs: a12[c.insee].nbobs_com
  }));
}

if (process.argv[1].endsWith('rent-index.mjs')) {
  const t = rentTable();
  console.log('commune | app €/m² | T1-T2 €/m² | T3+ €/m² | maison €/m² | T3+/T1-T2 | maille | annonces');
  for (const r of t) console.log([r.commune, r.app.toFixed(2), r.app12.toFixed(2), r.app3.toFixed(2), r.maison.toFixed(2), (r.app3 / r.app12).toFixed(3), r.typpred, r.nbobs].join(' | '));
}

// Audit (lecture seule) : répartition par taille des meublés de tourisme référencés par les offices de tourisme
// dans DATAtourisme (Licence Ouverte), à partir du nombre de chambres mentionné dans le nom ou la description.
// Usage : node scripts/audit/datatourisme-mix.mjs <datatourisme-reg-bre.csv>
import fs from 'node:fs';
import { parseCsv, writeJson, readJson } from '../lib/util.mjs';

const WORDS = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };

export function bedroomsFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\bstudio\b/.test(t) && !/\d+\s*chambres?/.test(t)) return 0;
  const m = t.match(/(\d+|une|un|deux|trois|quatre|cinq|six|sept|huit)\s+chambres?\b/);
  if (m) {
    const n = WORDS[m[1]] ?? Number(m[1]);
    return Number.isFinite(n) && n >= 0 && n <= 12 ? n : null;
  }
  const t2 = t.match(/\b(t|f)\s?([1-6])\b/);
  if (t2) return Math.max(0, Number(t2[2]) - 1);
  return null;
}

export function analyse(rows, communes) {
  const isRental = (c) => /RentalAccommodation|SelfCatering|Gite|Gîte|holidayrental|CollectiveAccommodation/i.test(c) && !/Hotel|Camping|Campsite|Hostel/i.test(c);
  const out = {};
  for (const c of communes) {
    const sel = rows.filter((r) => isRental(r.Categories_de_POI || '') && String(r.Code_postal_et_commune || '').toLowerCase().includes(`#${c.label.toLowerCase()}`));
    const counts = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 };
    let known = 0;
    for (const r of sel) {
      const b = bedroomsFromText(`${r.Nom_du_POI} ${r.Description}`);
      if (b === null) continue;
      known++;
      counts[b >= 4 ? '4+' : String(b)]++;
    }
    const share = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, known ? Math.round((v / known) * 1000) / 1000 : null]));
    out[c.id] = { commune: c.label, listed: sel.length, withSize: known, counts, share };
  }
  return out;
}

if (process.argv[1].endsWith('datatourisme-mix.mjs')) {
  const rows = parseCsv(fs.readFileSync(process.argv[2], 'utf8'));
  const communes = readJson('config/communes.json').communes;
  const res = analyse(rows, communes);
  writeJson('reports/audit-datatourisme-mix.json', { source: 'DATAtourisme, export régional Bretagne (Licence Ouverte), offices de tourisme', generatedAt: new Date().toISOString(), communes: res });
  for (const r of Object.values(res)) console.log(`${r.commune.padEnd(26)} référencés ${String(r.listed).padStart(4)} · taille connue ${String(r.withSize).padStart(4)} · ${JSON.stringify(r.share)}`);
}

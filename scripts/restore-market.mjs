// Restauration d'une version archivée de market.json (procédure en cas d'échec).
//   node scripts/restore-market.mjs --list
//   node scripts/restore-market.mjs <fichier de data/history/market-versions/>
// La version active est elle-même archivée avant d'être remplacée : rien n'est jamais perdu.
// Après restauration : `npm run build -- ` n'est PAS relancé (il reconstruirait à partir des fichiers bruts) ;
// lancer `node scripts/build-embed.mjs` pour régénérer l'émulateur avec la version restaurée, puis `npm test`.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/util.mjs';

const DIR = 'data/history/market-versions';
const stamp = (iso) => String(iso).replace(/[:.]/g, '-');

export function listVersions(root = ROOT) {
  const dir = path.join(root, DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const years = [...new Set(Object.values(m.markets).map((x) => x.period.end.slice(0, 4)))].join(', ');
    return { file: `${DIR}/${f}`, generatedAt: m.generatedAt, marketYears: years, markets: Object.keys(m.markets).length };
  });
}

export function restoreVersion(file, root = ROOT) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) throw new Error(`version introuvable : ${file}`);
  const candidate = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (!candidate.markets || !Object.keys(candidate.markets).length) throw new Error('version archivée vide : restauration refusée');
  const activePath = path.join(root, 'dist/market.json');
  const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  const archive = path.join(root, DIR, `market-${stamp(active.generatedAt)}.json`);
  if (!fs.existsSync(archive)) fs.writeFileSync(archive, JSON.stringify(active, null, 2) + '\n', 'utf8');
  fs.writeFileSync(activePath, JSON.stringify(candidate, null, 2) + '\n', 'utf8');
  fs.appendFileSync(path.join(root, 'data/history/updates.jsonl'), JSON.stringify({ at: new Date().toISOString(), kind: 'restore', restored: file, archivedActive: path.relative(root, archive).split(path.sep).join('/') }) + '\n');
  return { restored: file, archivedActive: archive };
}

if (process.argv[1].endsWith('restore-market.mjs')) {
  const arg = process.argv[2];
  if (!arg || arg === '--list') {
    const v = listVersions();
    if (!v.length) console.log('Aucune version archivée pour l\'instant (la première est créée à la première activation automatique).');
    for (const x of v) console.log(`${x.file}  ·  construite le ${x.generatedAt}  ·  millésime ${x.marketYears}  ·  ${x.markets} marchés`);
  } else {
    const r = restoreVersion(arg);
    console.log(`Restauré : ${r.restored}. Version remplacée archivée : ${r.archivedActive}. Lancer ensuite : node scripts/build-embed.mjs && npm test`);
  }
}

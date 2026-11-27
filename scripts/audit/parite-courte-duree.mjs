// Parité du parcours courte durée (lecture seule) : calcule une grille d'entrées avec le moteur courte durée et
// compare chaque résultat complet à l'empreinte figée dans tests/fixtures/courte-duree-parite.json.
// Fixture capturée le 2026-11-27 sur main (5d71ac4, moteur 1.3.1) avant tout ajout du parcours bail mobilité.
// Les données de marché sont FIGÉES (copie de dist/market.json de 5d71ac4) : la parité contrôle le moteur et la
// configuration, pas les données. Sans cela, chaque actualisation automatique de dist/market.json ferait échouer
// ce contrôle dans la zone de préparation de scripts/refresh.mjs et bloquerait l'activation des nouvelles données.
//   node scripts/audit/parite-courte-duree.mjs          → comparaison
//   node scripts/audit/parite-courte-duree.mjs --write  → (re)capture : uniquement sur une version validée
import crypto from 'node:crypto';
import { readJson, writeJson } from '../lib/util.mjs';
import { estimate, ENGINE_VERSION } from '../../engine/index.js';

const TODAY = new Date('2026-11-27T12:00:00Z');
const FIXTURE = 'tests/fixtures/courte-duree-parite.json';
const MARKET_FIGE = 'tests/fixtures/courte-duree-parite-market.json';
const TYPES = { studio: [0, 22, 2, 1], t1: [0, 30, 2, 1], t2: [1, 42, 4, 1], t3: [2, 65, 5, 1], t4: [3, 85, 6, 2], maison: [3, 110, 6, 2] };
const VARIANTES = [
  { location: 'standard', monthsMode: 'count', monthsCount: '12', commissionPct: '20', cleaningFee: '45', avgStay: '' },
  { location: 'hypercentre', monthsMode: 'count', monthsCount: '8', commissionPct: '18', cleaningFee: '35', avgStay: '3' },
  { location: 'standard', monthsMode: 'select', monthsSelected: [0, 1, 2, 9, 10, 11], monthsCount: '', commissionPct: '25', cleaningFee: '60', avgStay: '2.5' }
];

export function grille() {
  const cfg = readJson('config/config.json');
  const ctx = { config: cfg, communes: readJson('config/communes.json'), sources: readJson('config/sources.json'), marketSources: [{ origin: 'remote', data: readJson(MARKET_FIGE) }], today: TODAY };
  const locs = Object.keys(cfg.location.levels);
  const out = {};
  for (const c of ctx.communes.communes.filter((x) => x.active)) {
    for (const [type, [bedrooms, area, guests, bathrooms]] of Object.entries(TYPES)) {
      VARIANTES.forEach((v, i) => {
        const raw = { commune: c.id, type, bedrooms: String(bedrooms), bathrooms: String(bathrooms), area: String(area), guests: String(guests), amenities: i === 1 ? ['renove', 'serrure-connectee'] : [], monthsSelected: [], ...v };
        if (!locs.includes(raw.location)) raw.location = locs[0];
        const r = estimate(raw, ctx);
        out[`${c.id}|${type}|${i}`] = { sha256: crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex'), ok: r.ok, owner: r.ok ? Math.round(r.scenarios.realiste.ownerIncome) : null };
      });
    }
  }
  return out;
}

if ((process.argv[1] || '').endsWith('parite-courte-duree.mjs')) {
  const g = grille();
  if (process.argv.includes('--write')) {
    writeJson(FIXTURE, { capturedAt: '2026-11-27', engineVersion: ENGINE_VERSION, base: 'main 5d71ac4', today: TODAY.toISOString(), cases: g });
    console.log(`${FIXTURE} : ${Object.keys(g).length} cas`);
  } else {
    const ref = readJson(FIXTURE).cases;
    const diff = Object.keys(ref).filter((k) => !g[k] || g[k].sha256 !== ref[k].sha256);
    console.log(diff.length ? `ÉCARTS : ${diff.join(', ')}` : `${Object.keys(ref).length}/${Object.keys(ref).length} cas strictement identiques`);
    process.exit(diff.length ? 1 : 0);
  }
}

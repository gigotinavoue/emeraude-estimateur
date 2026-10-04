// Historise les données de marché par millésime : data/market/<année>/…
// Règle : aucun écrasement silencieux. Si un fichier existe et que son contenu (hors champs de fraîcheur) diffère,
// l'ancien est archivé sous <nom>.replaced-<horodatage>.json et le changement est journalisé dans data/history/updates.jsonl.
import fs from 'node:fs';
import { readJson, readJsonIfExists, writeJson, p } from './lib/util.mjs';

const VOLATILE = new Set(['freshnessDays', 'freshnessMonths', 'status', 'freshnessComputedAt', 'generatedAt', 'writtenAt']);
const stable = (x) => JSON.stringify(x, (k, v) => (VOLATILE.has(k) ? undefined : v));

export function yearOf(period) {
  return period && period.end ? period.end.slice(0, 4) : null;
}

// Répartit market.json par année de fin de période.
export function splitByYear(market) {
  const years = {};
  const at = (y) => (years[y] = years[y] || { markets: {}, seasonalityInputs: {}, indicators: [], controls: {} });
  for (const [k, m] of Object.entries(market.markets)) at(yearOf(m.period)).markets[k] = m;
  for (const [id, s] of Object.entries(market.seasonality || {})) {
    if (!s.meta) continue;
    for (const part of ['occupancy', 'adr']) {
      const y = s.meta[part].periodEnd.slice(0, 4);
      at(y).seasonalityInputs[`${id}.${part}`] = s.meta[part];
    }
  }
  for (const [y, list] of Object.entries(market.indicators || {})) at(y).indicators.push(...list);
  const e = market.controls && market.controls.eurostatRennes;
  if (e) at(String(e.year)).controls.eurostatRennes = e;
  return years;
}

export function writeHistory(market, { stamp = new Date().toISOString(), dir = 'data/market' } = {}) {
  const log = [];
  const years = splitByYear(market);
  for (const [y, content] of Object.entries(years)) {
    const files = {
      'base.json': Object.keys(content.markets).length ? { usage: 'Base de marché (prix, occupation, durée de séjour) — millésime cohérent', markets: content.markets } : null,
      'seasonality-inputs.json': Object.keys(content.seasonalityInputs).length ? { usage: 'Séries mensuelles utilisées pour les profils saisonniers (PROXY)', inputs: content.seasonalityInputs } : null,
      'indicators.json': content.indicators.length ? { usage: 'Indicateurs annuels (contrôle et tendance, jamais base de calcul)', indicators: content.indicators } : null,
      'controls.json': Object.keys(content.controls).length ? { usage: 'Contrôles automatiques (Eurostat)', ...content.controls } : null
    };
    for (const [name, data] of Object.entries(files)) {
      if (!data) continue;
      const rel = `${dir}/${y}/${name}`;
      const prev = readJsonIfExists(rel);
      const next = { year: Number(y), writtenAt: stamp, ...data };
      if (prev && stable(prev) === stable(next)) continue;
      if (prev) {
        const archive = rel.replace(/\.json$/, `.replaced-${String(prev.writtenAt || stamp).replace(/[:.]/g, '-')}.json`);
        fs.copyFileSync(p(rel), p(archive));
        log.push({ file: rel, action: 'replaced', archivedAs: archive });
      } else log.push({ file: rel, action: 'created' });
      writeJson(rel, next);
    }
  }
  const index = {
    generatedAt: stamp,
    marketGeneratedAt: market.generatedAt,
    years: Object.keys(years).sort().map((y) => ({
      year: Number(y),
      baseMarkets: Object.keys(years[y].markets).length,
      seasonalityInputs: Object.keys(years[y].seasonalityInputs),
      indicators: years[y].indicators.length,
      controls: Object.keys(years[y].controls)
    })),
    baseYearInUse: [...new Set(Object.values(market.markets).map((m) => Number(yearOf(m.period))))].sort()
  };
  writeJson(`${dir}/index.json`, index);
  return { log, index };
}

if (process.argv[1].endsWith('history-market.mjs')) {
  const market = readJson('dist/market.json');
  const { log, index } = writeHistory(market);
  if (log.length) fs.appendFileSync(p('data/history/updates.jsonl'), JSON.stringify({ at: new Date().toISOString(), kind: 'history', changes: log }) + '\n');
  console.log(`Historique : millésimes ${index.years.map((y) => y.year).join(', ')} ; base de marché utilisée : ${index.baseYearInUse.join(', ')}.`);
  for (const l of log) console.log(`  ${l.action === 'created' ? '+' : '~'} ${l.file}${l.archivedAs ? ` (ancien archivé : ${l.archivedAs})` : ''}`);
  if (!log.length) console.log('  aucun changement de contenu.');
}

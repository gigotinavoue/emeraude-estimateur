// Vérifie la fraîcheur des données de marché publiées et l'âge du dernier build.
// Écrit dist/freshness.json (par marché) et dist/data-status.json (par famille de données, avec classe de donnée).
// En GitHub Actions, expose `needs_attention=true|false` pour ouvrir un rappel.
import fs from 'node:fs';
import { readJson, readJsonIfExists, writeJson } from './lib/util.mjs';
import { freshness } from '../engine/quality.js';
import { freshnessOf, minStatus, LEVEL_TO_STATUS } from './lib/freshness.mjs';

// Classification de chaque élément utilisé par l'estimateur (aucun proxy présenté comme observation locale).
export const CLASSIFICATION = [
  { item: 'Prix moyen, occupation, durée de séjour par intercommunalité (Ille & Vilaine Tourisme / Lighthouse)', dataClass: 'OBSERVÉE', family: 'market', note: 'Observation à l\'échelle de l\'intercommunalité, appliquée à toutes ses communes.' },
  { item: 'Repli sur le département ou un marché voisin', dataClass: 'FALLBACK', family: 'market', note: 'Signalé à l\'utilisateur ; abaisse la confiance.' },
  { item: 'Profil saisonnier urbain — occupation (Insee, hôtels, Ille-et-Vilaine)', dataClass: 'PROXY', family: 'seasonality', note: 'Hôtellerie utilisée comme forme de saisonnalité des meublés urbains.' },
  { item: 'Profil saisonnier littoral — occupation (meublés, département)', dataClass: 'PROXY', family: 'seasonality', note: 'Série départementale appliquée aux communes littorales.' },
  { item: 'Profils saisonniers — prix mensuels (meublés, département)', dataClass: 'PROXY', family: 'seasonality', note: 'Série départementale, amortie.' },
  { item: 'Courbe des chambres (0,82 / 1 / 1,45 / 1,85 / 2,50) et mélange de tailles', dataClass: 'CALIBRATION', family: 'model', note: 'Ratios agrégés Inside Airbnb (Lyon, Bordeaux, Pays basque) ; usage interne (D10).' },
  { item: 'Logement de référence (1 chambre), emplacement, équipements, scénarios, capacité, salles de bain', dataClass: 'HYPOTHÈSE', family: 'model', note: 'Hypothèses Émeraude documentées (D6, D7, D12-D14).' },
  { item: 'Frais Airbnb, commission, ménage', dataClass: 'HYPOTHÈSE', family: 'model', note: 'Règles contractuelles (D1-D3).' },
  { item: 'Indicateurs départementaux 2025 (Chiffres clés)', dataClass: 'OBSERVÉE', family: 'indicators', note: 'Contrôle et tendance ; jamais base de calcul (TJM non comparable).' },
  { item: 'Indicateurs Rennes Métropole 2025 (AUDIAR)', dataClass: 'OBSERVÉE', family: 'indicators', note: 'Tendance de la demande et de l\'offre ; aucun prix ni occupation.' },
  { item: 'Eurostat — nuits louées via plateformes (Rennes, Bretagne)', dataClass: 'OBSERVÉE', family: 'controls', note: 'Contrôle de la durée de séjour et du mois de pointe.' },
  { item: 'Données de secours intégrées à l\'outil', dataClass: 'FALLBACK', family: 'market', note: 'Utilisées si le fichier de marché est indisponible ; confiance FAIBLE.' },
  { item: 'Données des logements Émeraude', dataClass: 'CALIBRATION', family: 'emeraude', note: 'Architecture prête, aucune donnée chargée ; privées, jamais publiées.' }
];

export function dataStatus({ market, communes, config, today }) {
  const used = new Set(communes.communes.map((c) => `epci:${c.epci}`));
  const fam = (id, label, role, items) => {
    const status = items.length ? minStatus(items.map((x) => x.status)) : 'LOW';
    const newestEnd = items.map((x) => x.periodEnd).filter(Boolean).sort().pop() || null;
    const oldestEnd = items.map((x) => x.periodEnd).filter(Boolean).sort()[0] || null;
    return { id, label, role, status, periods: { oldestEnd, newestEnd }, items };
  };
  const item = (label, src, periodEnd, dataClass, extra = {}) => ({ label, source: src, periodEnd, dataClass, ...freshnessOf(periodEnd, today, config), ...extra });

  const marketItems = Object.entries(market.markets)
    .filter(([k]) => used.has(k))
    .map(([k, m]) => item(m.label, m.source, m.period.end, (m.meta && m.meta.dataClass) || 'OBSERVÉE', { key: k, retrievedAt: m.meta ? m.meta.retrievedAt : null }));
  const seasonItems = [];
  for (const [id, s] of Object.entries(market.seasonality || {})) {
    for (const part of ['occupancy', 'adr']) {
      const m = s.meta && s.meta[part];
      if (m) seasonItems.push(item(`${s.label} — ${part === 'occupancy' ? 'occupation' : 'prix'}`, m.source, m.periodEnd, m.dataClass, { retrievedAt: m.retrievedAt }));
    }
  }
  const indItems = Object.values(market.indicators || {}).flat();
  const indBySource = {};
  for (const x of indItems) (indBySource[x.source] = indBySource[x.source] || []).push(x);
  const indicatorItems = Object.entries(indBySource).map(([src, list]) => item(`${list[0].document} (${list.length} indicateurs)`, src, list[0].period.end, list[0].dataClass, { retrievedAt: list[0].retrievedAt, publicationDate: list[0].publicationDate }));
  const e = market.controls && market.controls.eurostatRennes;
  const controlItems = e ? [item(`Eurostat Rennes ${e.year}`, 'eurostat_platforms', `${e.year}-12-31`, 'OBSERVÉE', { retrievedAt: e.meta ? e.meta.retrievedAt : null })] : [];

  const families = [
    fam('market', 'Marché (prix, occupation, durée de séjour)', 'calcul', marketItems),
    fam('seasonality', 'Saisonnalité (profils mensuels)', 'calcul', seasonItems),
    fam('indicators', 'Indicateurs annuels récents', 'contrôle', indicatorItems),
    fam('controls', 'Contrôles automatiques (Eurostat)', 'contrôle', controlItems)
  ];
  // Confiance « données » : seules les familles qui entrent dans le calcul comptent.
  const global = minStatus(families.filter((f) => f.role === 'calcul').map((f) => f.status));
  const marketYear = [...new Set(marketItems.map((x) => x.periodEnd.slice(0, 4)))].sort();
  return {
    checkedAt: today.toISOString(),
    marketGeneratedAt: market.generatedAt,
    marketDataYear: marketYear.join(', '),
    thresholds: { HIGH: `≤ ${config.freshness.greenMaxMonths} mois`, MEDIUM: `> ${config.freshness.greenMaxMonths} et ≤ ${config.freshness.orangeMaxMonths} mois`, LOW: `> ${config.freshness.orangeMaxMonths} mois` },
    globalDataConfidence: global,
    globalRule: 'Minimum des familles utilisées dans le calcul (marché, saisonnalité). Les indicateurs et contrôles n\'abaissent ni ne relèvent la confiance.',
    families,
    classification: CLASSIFICATION
  };
}

if (process.argv[1].endsWith('check-freshness.mjs')) {
  const config = readJson('config/config.json');
  const communes = readJson('config/communes.json');
  const market = readJson('dist/market.json');
  const today = process.env.ESTIMATEUR_TODAY ? new Date(process.env.ESTIMATEUR_TODAY) : new Date();

  const used = new Set(communes.communes.map((c) => `epci:${c.epci}`));
  const rows = Object.entries(market.markets)
    .filter(([k]) => used.has(k) || k.startsWith('departement:'))
    .map(([k, m]) => {
      const f = freshness(m.period, m.publishedAt, today, config);
      return { key: k, ...f, freshnessLabel: f.label, label: m.label, status: LEVEL_TO_STATUS[f.level] };
    });
  const buildAgeDays = Math.round((today - new Date(market.generatedAt)) / 86400000);
  const pipelineStale = buildAgeDays > config.freshness.pipelineStaleDays;
  const worst = rows.some((r) => r.level === 'red') ? 'red' : rows.some((r) => r.level === 'orange') ? 'orange' : 'green';
  const needsAttention = worst === 'red' || pipelineStale;

  writeJson('dist/freshness.json', { checkedAt: today.toISOString(), buildAgeDays, pipelineStale, worst, rows });
  const status = dataStatus({ market, communes, config, today });
  status.pipeline = { buildAgeDays, pipelineStale };
  const prev = readJsonIfExists('dist/data-status.json');
  writeJson('dist/data-status.json', status);

  console.log(`Fraîcheur la plus défavorable : ${worst} · dernier build il y a ${buildAgeDays} jour(s)${pipelineStale ? ' (pipeline en retard)' : ''}.`);
  for (const r of rows) console.log(`  ${r.level.padEnd(6)} ${r.label} — ${r.text} (${r.months} mois)`);
  console.log(`Fraîcheur par famille (données de marché : ${status.marketDataYear}) :`);
  for (const f of status.families) console.log(`  ${f.status.padEnd(6)} ${f.label} [${f.role}] — fin de période ${f.periods.oldestEnd}${f.periods.newestEnd !== f.periods.oldestEnd ? ` à ${f.periods.newestEnd}` : ''}`);
  console.log(`Confiance « données » globale : ${status.globalDataConfidence}${prev && prev.globalDataConfidence !== status.globalDataConfidence ? ` (précédemment ${prev.globalDataConfidence})` : ''}.`);
  if (worst !== 'green') console.log('Rappel : le bilan annuel d\'Ille & Vilaine Tourisme paraît habituellement vers avril, les Chiffres clés vers mai-juin. Suivre docs/procedure-donnees-annuelles.md.');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `needs_attention=${needsAttention}\nworst=${worst}\n`);
}

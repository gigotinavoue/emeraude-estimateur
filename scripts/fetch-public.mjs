// Ancienne commande de collecte : conservée pour compatibilité.
// Depuis l'automatisation (octobre 2026), toute écriture des données actives passe par scripts/refresh.mjs
// (contrôles avant acceptation, archivage, reconstruction en zone de préparation, tests, seuils).
// `node scripts/fetch-public.mjs` lance donc une simulation (aucune donnée active modifiée).
export { lastPeriod } from './lib/fetch-sources.mjs';

if (process.argv[1].endsWith('fetch-public.mjs')) {
  const { runRefresh, printSummary } = await import('./refresh.mjs');
  const result = await runRefresh({ dryRun: true });
  printSummary(result);
}

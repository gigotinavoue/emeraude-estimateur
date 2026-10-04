// Fraîcheur d'une donnée (pipeline) : mêmes seuils et même calcul de mois que le moteur (engine/quality.js).
// HIGH ≤ greenMaxMonths (15) ; MEDIUM ≤ orangeMaxMonths (27) ; LOW au-delà. Âge mesuré depuis la FIN de la période.
import { parseDate, monthsBetween } from '../../engine/quality.js';

export const LEVEL_TO_STATUS = { green: 'HIGH', orange: 'MEDIUM', red: 'LOW' };
const ORDER = ['LOW', 'MEDIUM', 'HIGH'];

export function freshnessOf(periodEnd, at, config) {
  const end = parseDate(periodEnd);
  if (!end) return { freshnessDays: null, freshnessMonths: null, status: 'LOW', reason: 'fin de période inconnue' };
  const months = Math.max(0, monthsBetween(end, at));
  const days = Math.max(0, Math.round((at - end) / 86400000));
  const f = config.freshness;
  const status = months <= f.greenMaxMonths ? 'HIGH' : months <= f.orangeMaxMonths ? 'MEDIUM' : 'LOW';
  return { freshnessDays: days, freshnessMonths: Math.round(months), status };
}

export function minStatus(list) {
  return list.reduce((a, b) => (ORDER.indexOf(b) < ORDER.indexOf(a) ? b : a), 'HIGH');
}

// Métadonnées normalisées d'une donnée (demandées pour chaque élément de marché).
export function buildMeta({ source, sourceUrl, publicationDate, period, retrievedAt, territory, methodology, license, dataClass, at, config }) {
  return {
    source,
    sourceUrl: sourceUrl || null,
    publicationDate: publicationDate || null,
    periodStart: period ? period.start : null,
    periodEnd: period ? period.end : null,
    retrievedAt: retrievedAt || null,
    territory,
    methodology: methodology || null,
    license: license || null,
    dataClass,
    ...freshnessOf(period && period.end, at, config),
    freshnessComputedAt: at.toISOString()
  };
}

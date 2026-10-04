// Fraîcheur des données et niveau de confiance (règles explicites, pas de score statistique).
import { isNum } from './safe.js';

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)));
}

export function monthsBetween(a, b) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() - a.getUTCDate()) / 30;
}

export function formatMonthYear(s) {
  const d = parseDate(s);
  return d ? `${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}` : 'date inconnue';
}

export function describePeriod(period) {
  if (!period) return 'période inconnue';
  const s = parseDate(period.start);
  const e = parseDate(period.end);
  if (s && e && s.getUTCMonth() === 0 && e.getUTCMonth() === 11 && s.getUTCFullYear() === e.getUTCFullYear()) return `année ${s.getUTCFullYear()}`;
  return `${formatMonthYear(period.start)} – ${formatMonthYear(period.end)}`;
}

export function freshness(period, publishedAt, today, config) {
  const end = parseDate(period && period.end);
  if (!end) return { level: 'red', months: 0, label: 'Date des données inconnue' };
  const months = Math.max(0, monthsBetween(end, today));
  const f = config.freshness;
  const level = months <= f.greenMaxMonths ? 'green' : months <= f.orangeMaxMonths ? 'orange' : 'red';
  const labels = { green: 'Données récentes', orange: 'Données anciennes', red: 'Données très anciennes' };
  return { level, months: Math.round(months), label: labels[level], text: `${describePeriod(period)}${publishedAt ? ` · publiées en ${formatMonthYear(publishedAt)}` : ''}` };
}

const ORDER = ['faible', 'moyenne', 'elevee'];
function capLevel(current, cap) {
  return ORDER.indexOf(cap) < ORDER.indexOf(current) ? cap : current;
}

export function confidence({ geoRole, origin, sampleNights, freshnessLevel }, config) {
  const c = config.confidence;
  let level = 'elevee';
  const reasons = [];
  if (c.lowGeoLevels.includes(geoRole)) {
    level = capLevel(level, 'faible');
    reasons.push('Données départementales utilisées (pas de donnée intercommunale).');
  }
  if (geoRole === 'epci_voisin' && c.mediumIfNeighbourMarket) {
    level = capLevel(level, 'moyenne');
    reasons.push('Marché voisin utilisé.');
  }
  if (isNum(sampleNights) && sampleNights < c.mediumIfSampleNightsBelow) {
    level = capLevel(level, 'moyenne');
    reasons.push(`Marché de petite taille (${Math.round(sampleNights).toLocaleString('fr-FR')} nuits réservées sur la période).`);
  }
  const fc = c.freshnessCaps[freshnessLevel];
  if (fc && ORDER.indexOf(fc) < ORDER.indexOf(level)) reasons.push('Ancienneté des données.');
  if (fc) level = capLevel(level, fc);
  if (origin === 'snapshot') {
    if (ORDER.indexOf(c.snapshotCap) < ORDER.indexOf(level)) reasons.push('Données de secours intégrées utilisées.');
    level = capLevel(level, c.snapshotCap);
  }
  if (reasons.length === 0) reasons.push('Données intercommunales récentes et marché de taille suffisante.');
  return { level, label: c.labels[level], reasons };
}

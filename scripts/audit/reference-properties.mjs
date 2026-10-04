// Les 8 logements de référence (lecture seule) : prix par nuit, occupation, CA, fourchette, confiance.
// Sert à vérifier qu'une actualisation des données ne change pas les estimations sans justification.
// Usage : node scripts/audit/reference-properties.mjs [--snapshot tests/fixtures/reference-before-refresh.json]
import { readJson, writeJson } from '../lib/util.mjs';
import { RANGE_CASES, run, NOW } from './final-review.mjs';
import { estimate } from '../../engine/index.js';

export function referenceProperties(market = readJson('dist/market.json'), today = NOW) {
  const config = readJson('config/config.json');
  const ctx = { config, communes: readJson('config/communes.json'), sources: readJson('config/sources.json'), marketSources: [{ origin: 'remote', data: market }], today };
  return RANGE_CASES.map(([label, over]) => {
    const r = estimate({ commune: 'rennes', type: 't2', bedrooms: '1', bathrooms: '1', area: '40', guests: '2', location: 'standard', amenities: [], monthsMode: 'count', monthsCount: '10', monthsSelected: [], commissionPct: '20', cleaningFee: '40', avgStay: '', vat: false, ...over }, ctx);
    if (!r.ok) throw new Error(`${label} : ${JSON.stringify(r.errors)}`);
    const s = r.scenarios.realiste;
    return {
      label,
      marketKey: r.data.marketKey,
      marketPeriod: r.data.market.period,
      adr: Math.round(s.adrAnnual * 100) / 100,
      occupancyPct: Math.round(s.occupancyAnnual * 1000) / 10,
      nightsRevenue: Math.round(s.nightsRevenue),
      central: r.summary.central,
      low: r.summary.low,
      high: r.summary.high,
      uncertaintyPct: r.summary.uncertaintyPct,
      confidence: r.summary.confidence,
      freshnessMonths: r.data.freshness.months
    };
  });
}

if (process.argv[1].endsWith('reference-properties.mjs')) {
  void run; // garde l'import (contexte identique à la revue finale)
  const rows = referenceProperties();
  const i = process.argv.indexOf('--snapshot');
  if (i > 0) writeJson(process.argv[i + 1], { capturedAt: new Date().toISOString(), today: NOW.toISOString(), properties: rows });
  for (const x of rows) console.log(`${x.label.padEnd(30)} ${x.marketKey.padEnd(26)} prix ${x.adr.toFixed(2).padStart(7)} € occ ${x.occupancyPct.toFixed(1)} % CA ${x.nightsRevenue} → ${x.central} € [${x.low}–${x.high}] ±${x.uncertaintyPct} % ${x.confidence} (${x.freshnessMonths} mois)`);
}

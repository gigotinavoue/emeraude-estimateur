// Exécute tous les adaptateurs et écrit data/observations/observations.json (format unique).
import { writeJson } from './lib/util.mjs';
import * as adt35 from './adapters/adt35.mjs';
import * as eurostat from './adapters/eurostat.mjs';
import * as insee from './adapters/insee.mjs';
import * as emeraude from './adapters/emeraude.mjs';

export const ADAPTERS = { adt35, eurostat, insee, emeraude };

export function normalizeAll(retrievedAt = new Date().toISOString()) {
  const all = [];
  const summary = {};
  for (const [name, mod] of Object.entries(ADAPTERS)) {
    try {
      const obs = mod.run({ retrievedAt });
      summary[name] = obs.length;
      all.push(...obs);
    } catch (e) {
      summary[name] = `ERREUR : ${e.message}`;
    }
  }
  return { observations: all, summary };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('normalize.mjs')) {
  const { observations, summary } = normalizeAll();
  writeJson('data/observations/observations.json', { generatedAt: new Date().toISOString(), count: observations.length, observations });
  console.log('Observations par adaptateur :', summary);
  if (Object.values(summary).some((v) => typeof v === 'string')) process.exitCode = 1;
}

// Validation : schémas des fichiers de configuration, schéma de chaque observation,
// bornes de plausibilité et variations brutales par rapport au dernier market.json publié.
import { readJson, readJsonIfExists, writeJson } from './lib/util.mjs';
import { validateSchema } from './lib/schema.mjs';

export function validateConfigFiles() {
  const errors = [];
  const pairs = [
    ['config/config.json', 'schemas/config.schema.json'],
    ['config/communes.json', 'schemas/communes.schema.json'],
    ['config/sources.json', 'schemas/sources.schema.json']
  ];
  for (const [file, schema] of pairs) {
    const e = validateSchema(readJson(file), readJson(schema));
    errors.push(...e.map((x) => `${file} ${x}`));
  }
  const communes = readJson('config/communes.json');
  for (const c of communes.communes) if (!communes.epci[c.epci]) errors.push(`config/communes.json : EPCI « ${c.epci} » inconnu pour ${c.label}`);
  const config = readJson('config/config.json');
  const ids = new Set();
  for (const a of config.amenities.items) {
    if (ids.has(a.id)) errors.push(`config.json : équipement en double « ${a.id} »`);
    ids.add(a.id);
    if (a.group === 'base' && (a.adr !== 0 || a.occPts !== 0)) errors.push(`config.json : l'équipement essentiel « ${a.id} » doit avoir un effet nul`);
  }
  if (config.guards.occupancy[0] >= config.guards.occupancy[1]) errors.push('config.json : bornes d\'occupation incohérentes');
  if (config.scenarios.occupancyDeltaPts.min > config.scenarios.occupancyDeltaPts.max) errors.push('config.json : delta de scénario min > max');
  return errors;
}

const MARKET_METRICS = { adr: 'adr', occupancy: 'occupancy', avgStay: 'avgStay' };

export function validateObservations(observations, config, previousMarket) {
  const schema = readJson('schemas/observation.schema.json');
  const report = { schemaErrors: [], rejected: [], keptPrevious: [] };
  for (const o of observations) {
    const e = validateSchema(o, schema);
    if (e.length) {
      report.schemaErrors.push(`${o.id || '(sans id)'} : ${e.join(' ; ')}`);
      o.status = 'rejected';
      o.statusReason = 'schéma invalide';
      continue;
    }
    const range = MARKET_METRICS[o.metric] && config.validation[MARKET_METRICS[o.metric]];
    if (range && o.period.granularity === 'year' && (o.value < range[0] || o.value > range[1])) {
      o.status = 'rejected';
      o.statusReason = `valeur ${o.value} hors bornes [${range[0]} ; ${range[1]}]`;
      report.rejected.push(`${o.id} : ${o.statusReason}`);
      continue;
    }
    // Variation brutale vs dernière publication -> on garde la valeur précédente.
    if (previousMarket && (o.metric === 'adr' || o.metric === 'occupancy') && o.period.granularity === 'year' && (o.geo.level === 'epci' || o.geo.level === 'departement')) {
      const key = o.geo.level === 'departement' ? `departement:${o.geo.id}` : `epci:${o.geo.id}`;
      const prev = previousMarket.markets && previousMarket.markets[key];
      if (prev && prev.source === o.source && prev.period && prev.period.end !== o.period.end) {
        const pv = prev[o.metric];
        const max = config.validation.maxYoyChange[o.metric];
        const change = o.metric === 'adr' ? Math.abs(o.value / pv - 1) : Math.abs(o.value - pv);
        if (change > max) {
          o.status = 'kept_previous';
          o.statusReason = `variation ${o.metric === 'adr' ? `${(change * 100).toFixed(0)} %` : `${(change * 100).toFixed(0)} pts`} > seuil ; valeur précédente conservée`;
          report.keptPrevious.push(`${o.id} : ${o.statusReason}`);
        }
      }
    }
  }
  return report;
}

if (process.argv[1].endsWith('validate.mjs')) {
  const cfgErrors = validateConfigFiles();
  const config = readJson('config/config.json');
  const file = readJson('data/observations/observations.json');
  const previous = readJsonIfExists('dist/market.json');
  const report = validateObservations(file.observations, config, previous);
  writeJson('data/observations/observations.json', file);
  writeJson('data/observations/validation-report.json', { at: new Date().toISOString(), configErrors: cfgErrors, ...report });
  console.log(`Configuration : ${cfgErrors.length} erreur(s)`);
  cfgErrors.forEach((e) => console.log('  - ' + e));
  console.log(`Observations : ${report.schemaErrors.length} erreur(s) de schéma, ${report.rejected.length} rejet(s), ${report.keptPrevious.length} valeur(s) précédente(s) conservée(s)`);
  [...report.schemaErrors, ...report.rejected, ...report.keptPrevious].forEach((e) => console.log('  - ' + e));
  if (cfgErrors.length || report.schemaErrors.length) process.exitCode = 1;
}

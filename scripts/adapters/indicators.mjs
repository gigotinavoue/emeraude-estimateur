// Indicateurs annuels saisis à la main (Chiffres clés, observatoires) : conservés et historisés,
// utilisés comme contrôles et tendances, JAMAIS comme base de calcul (voir reports/data-refresh-2026-10.md).
import fs from 'node:fs';
import { readCsv, readJson, p } from '../lib/util.mjs';

const FILES = /^indicateurs_.+_(\d{4})\.csv$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Contrôles d'une ligne saisie : valeur numérique, période valide, page citée, pourcentages et taux plausibles.
export function indicatorRowErrors(row, id = row.indicator) {
  const errors = [];
  const value = Number(row.value);
  if (row.value === '' || !Number.isFinite(value)) errors.push(`${id} : valeur non numérique`);
  if (!DATE.test(row.period_start || '') || !DATE.test(row.period_end || '') || row.period_start > row.period_end) errors.push(`${id} : période invalide`);
  if (!row.page) errors.push(`${id} : page source manquante`);
  if (!row.geo_id || !/^(commune|epci|departement):/.test(row.geo_id)) errors.push(`${id} : territoire invalide`);
  const isRate = row.unit === 'percent' && !/yoy/.test(row.indicator);
  if (isRate && (value < 0 || value > 100)) errors.push(`${id} : pourcentage hors [0 ; 100]`);
  if (/^tjm|adr/.test(row.indicator) && row.unit === 'EUR/night' && (value < 20 || value > 1000)) errors.push(`${id} : prix par nuit invraisemblable`);
  if (!/yoy/.test(row.indicator) && value < 0) errors.push(`${id} : valeur négative`);
  return errors;
}

export function readManifest() {
  return readJson('data/raw/manifest.json').files;
}

export function readIndicators() {
  const manifest = readManifest();
  const sources = readJson('config/sources.json').sources;
  const out = [];
  const errors = [];
  for (const dir of ['adt35', 'audiar']) {
    if (!fs.existsSync(p('data/raw', dir))) continue;
    for (const f of fs.readdirSync(p('data/raw', dir)).filter((x) => FILES.test(x))) {
      const rel = `data/raw/${dir}/${f}`;
      const m = manifest[rel];
      if (!m) { errors.push(`${rel} : absent de data/raw/manifest.json`); continue; }
      if (!sources[m.sourceId]) { errors.push(`${rel} : source « ${m.sourceId} » inconnue`); continue; }
      for (const row of readCsv(rel)) {
        const value = Number(row.value);
        const id = `${m.sourceId}|${row.period_start.slice(0, 4)}|${row.geo_id}|${row.indicator}`;
        errors.push(...indicatorRowErrors(row, id));
        out.push({
          id,
          indicator: row.indicator,
          value,
          unit: row.unit,
          territory: { geoId: row.geo_id, label: row.label },
          period: { start: row.period_start, end: row.period_end },
          definition: row.definition,
          comparableWith2024Base: row.comparable_with_2024_base,
          note: row.note || '',
          source: m.sourceId,
          sourceUrl: m.sourceUrl,
          document: m.document,
          page: row.page,
          publicationDate: m.publicationDate,
          retrievedAt: m.retrievedAt,
          license: m.license,
          dataClass: m.dataClass,
          usage: 'indicator'
        });
      }
    }
  }
  return { indicators: out, errors };
}

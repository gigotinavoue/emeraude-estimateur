import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
export const clone = (x) => JSON.parse(JSON.stringify(x));

export const TODAY = new Date('2026-10-04T12:00:00Z');

export function ctx(overrides = {}) {
  return {
    config: J('config/config.json'),
    communes: J('config/communes.json'),
    sources: J('config/sources.json'),
    marketSources: [{ origin: 'remote', data: J('tests/fixtures/market.valid.json') }],
    today: TODAY,
    ...overrides
  };
}

// Convertit un logement de fixtures en saisie brute du formulaire (nouveau moteur).
export function toRaw(prop, defaults, config) {
  const d = { ...defaults, ...prop };
  const amenities = d.amenities === 'ALL' ? config.amenities.items.map((a) => a.id) : d.amenities;
  return {
    commune: d.commune,
    type: d.type,
    bedrooms: String(d.bedrooms),
    bathrooms: String(d.bathrooms),
    area: String(d.area),
    guests: String(d.guests),
    location: d.location,
    amenities,
    monthsMode: d.months.mode,
    monthsCount: String(d.months.count ?? d.months.months.length),
    monthsSelected: d.months.months || [],
    commissionPct: String(d.commissionPct),
    cleaningFee: String(d.cleaningFee),
    avgStay: d.avgStay === null ? '' : String(d.avgStay),
    vat: !!d.vat
  };
}

// Convertit le même logement en saisie de l'ancien calculateur.
export function toLegacy(prop, defaults, config, communes) {
  const d = { ...defaults, ...prop };
  const amenities = d.amenities === 'ALL' ? config.amenities.items.map((a) => a.id) : d.amenities;
  return {
    city: communes.communes.find((c) => c.id === d.commune).label,
    type: config.types[d.type].label,
    bed: d.bedrooms,
    bath: d.bathrooms,
    area: d.area,
    guest: d.guests,
    months: d.months.count ?? d.months.months.length,
    loc: config.location.levels[d.location].label,
    commission: d.commissionPct,
    cleaningFee: d.cleaningFee,
    stayLength: d.avgStay,
    eq: amenities.map((id) => config.amenities.items.find((a) => a.id === id).legacyIndex)
  };
}

export function baseRaw(over = {}) {
  return {
    commune: 'rennes', type: 't2', bedrooms: '1', bathrooms: '1', area: '40', guests: '2', location: 'standard', amenities: [],
    monthsMode: 'count', monthsCount: '10', monthsSelected: [], commissionPct: '20', cleaningFee: '40', avgStay: '3', vat: false,
    ...over
  };
}

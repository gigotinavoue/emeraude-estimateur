// À exécuter EN LOCAL uniquement (jamais dans GitHub Actions) : transforme les données brutes privées
// des logements gérés (data/emeraude/private/listings_monthly.csv) en agrégats anonymisés
// (data/emeraude/aggregates.json), publiables. Aucun identifiant de logement ni montant individuel n'est publié.
import fs from 'node:fs';
import { readJson, writeJson, parseCsv, p } from './lib/util.mjs';
import { estimate } from '../engine/index.js';
import { bedroomsKey } from '../engine/inputs.js';

const REQUIRED = ['listing_ref', 'commune_insee', 'type', 'bedrooms', 'bathrooms', 'guests', 'area_m2', 'location_level', 'amenities', 'month', 'nights_available', 'nights_booked', 'revenue_nights_eur', 'cleaning_collected_eur'];

export function aggregate(rows, { config, communes, sources, market }) {
  const log = [];
  const marketNoCalib = { ...market, emeraude: { segments: [] } }; // le modèle de référence n'inclut pas la calibration
  const byInsee = new Map(communes.communes.map((c) => [c.insee, c]));
  const listings = new Map();
  for (const [i, r] of rows.entries()) {
    const miss = REQUIRED.filter((k) => r[k] === undefined || (r[k] === '' && k !== 'amenities'));
    if (miss.length) { log.push(`ligne ${i + 2} ignorée : champs manquants (${miss.join(', ')})`); continue; }
    const commune = byInsee.get(r.commune_insee);
    if (!commune) { log.push(`ligne ${i + 2} ignorée : commune ${r.commune_insee} non référencée`); continue; }
    const avail = Number(r.nights_available);
    const booked = Number(r.nights_booked);
    const rev = Number(r.revenue_nights_eur);
    if (![avail, booked, rev].every(Number.isFinite) || booked > avail || booked < 0) { log.push(`ligne ${i + 2} ignorée : nuits incohérentes`); continue; }
    const base = market.markets[`epci:${commune.epci}`] || market.markets['departement:35'];
    if (booked > 0 && rev / booked > base.adr * 3) { log.push(`ligne ${i + 2} ignorée : prix par nuit > 3 × marché (ménage probablement inclus dans revenue_nights_eur)`); continue; }
    const m = /^(\d{4})-(\d{2})$/.exec(r.month);
    if (!m) { log.push(`ligne ${i + 2} ignorée : mois invalide (AAAA-MM attendu)`); continue; }
    if (!listings.has(r.listing_ref)) listings.set(r.listing_ref, { first: r, commune, months: [] });
    listings.get(r.listing_ref).months.push({ ym: r.month, month: Number(m[2]) - 1, avail, booked, rev });
  }

  const segments = new Map();
  for (const [, L] of listings) {
    if (L.months.length < config.emeraude.minMonthsPerListing) continue;
    const f = L.first;
    const raw = {
      commune: L.commune.id, type: f.type, bedrooms: f.bedrooms, bathrooms: f.bathrooms, area: f.area_m2, guests: f.guests,
      location: f.location_level, amenities: f.amenities.split(';').map((s) => s.trim()).filter(Boolean),
      monthsMode: 'select', monthsSelected: [...new Set(L.months.map((x) => x.month))], monthsCount: '12',
      commissionPct: '20', cleaningFee: '0', avgStay: '', vat: false
    };
    const est = estimate(raw, { config, communes, sources, marketSources: [{ origin: 'remote', data: marketNoCalib }], today: new Date() });
    if (!est.ok) { log.push(`logement ignoré (saisie invalide pour le modèle) : ${JSON.stringify(est.errors)}`); continue; }
    const sumB = L.months.reduce((s, x) => s + x.booked, 0);
    const sumA = L.months.reduce((s, x) => s + x.avail, 0);
    const sumR = L.months.reduce((s, x) => s + x.rev, 0);
    if (sumB <= 0 || sumA <= 0) continue;
    const ratioAdr = (sumR / sumB) / est.scenarios.realiste.adr;
    const ratioOcc = (sumB / sumA) / est.scenarios.realiste.occupancy;
    const key = `${est.data.marketKey}|bedrooms:${bedroomsKey(Number(f.bedrooms))}`;
    if (!segments.has(key)) segments.set(key, { lnAdr: [], lnOcc: [], months: 0, start: '9999-99', end: '0000-00' });
    const s = segments.get(key);
    s.lnAdr.push(Math.log(ratioAdr));
    s.lnOcc.push(Math.log(ratioOcc));
    s.months += L.months.length;
    for (const x of L.months) { if (x.ym < s.start) s.start = x.ym; if (x.ym > s.end) s.end = x.ym; }
  }

  const out = [];
  const internalOnly = [];
  for (const [key, s] of segments) {
    const n = s.lnAdr.length;
    const g = (arr) => Math.round(Math.exp(arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000;
    const seg = { key, listings: n, listingMonths: s.months, ratioAdr: g(s.lnAdr), ratioOcc: g(s.lnOcc), period: { start: s.start, end: s.end } };
    if (n >= config.emeraude.minListingsToPublishAggregate) out.push(seg);
    else internalOnly.push(seg);
  }
  return { aggregates: { generatedAt: new Date().toISOString(), note: 'Agrégats anonymisés (≥ 3 logements par segment). Ratios = réel ÷ modèle (moyenne géométrique).', segments: out }, internalOnly, log };
}

if (process.argv[1].endsWith('aggregate-emeraude.mjs')) {
  const file = process.argv[2] || 'data/emeraude/private/listings_monthly.csv';
  if (!fs.existsSync(p(file))) {
    console.log(`Aucun fichier ${file} : rien à agréger. Format attendu : voir data/emeraude/README.md.`);
    process.exit(0);
  }
  const rows = parseCsv(fs.readFileSync(p(file), 'utf8'));
  const res = aggregate(rows, { config: readJson('config/config.json'), communes: readJson('config/communes.json'), sources: readJson('config/sources.json'), market: readJson('dist/market.json') });
  writeJson('data/emeraude/aggregates.json', res.aggregates);
  console.log(`${res.aggregates.segments.length} segment(s) publiable(s) ; ${res.internalOnly.length} segment(s) en simple observation (non publiés).`);
  res.internalOnly.forEach((s) => console.log(`  observation interne : ${s.key} — ${s.listings} logement(s), ratio prix ${s.ratioAdr}, ratio occupation ${s.ratioOcc}`));
  res.log.forEach((l) => console.log('  ' + l));
}

// Validation et normalisation des caractéristiques du logement saisies dans le formulaire.
import { toNumber, isNum } from './safe.js';

export function bedroomsKey(bedrooms) {
  return bedrooms >= 4 ? '4+' : String(bedrooms);
}

function readRange(raw, key, range, { integer = false, label }) {
  const n = toNumber(raw);
  if (!isNum(n)) return { error: `Veuillez saisir un nombre valide (${label}).` };
  if (integer && !Number.isInteger(n)) return { error: `Veuillez saisir un nombre entier (${label}).` };
  if (n < range[0] || n > range[1]) return { error: `${label} : valeur attendue entre ${range[0]} et ${range[1]}.` };
  return { value: n };
}

export function validateInputs(raw, config, communesCfg) {
  const errors = {};
  const warnings = [];
  const r = config.inputs;
  const d = config.defaults;
  const p = {};

  const commune = communesCfg.communes.find((c) => c.id === raw.commune && c.active !== false);
  if (!commune) errors.commune = 'Commune non référencée dans la configuration.';
  else p.commune = commune.id;

  p.type = config.types[raw.type] ? raw.type : d.type;
  if (!config.types[raw.type]) warnings.push({ field: 'type', message: 'Type de logement inconnu : valeur par défaut utilisée.' });

  const fields = [
    ['bedrooms', r.bedrooms, true, 'Chambres'],
    ['bathrooms', r.bathrooms, false, 'Salles de bain'],
    ['area', r.area, false, 'Superficie'],
    ['guests', r.guests, true, 'Capacité voyageurs'],
    ['commissionPct', r.commissionPct, false, 'Commission'],
    ['cleaningFee', r.cleaningFee, false, 'Frais de ménage']
  ];
  for (const [key, range, integer, label] of fields) {
    const res = readRange(raw[key], key, range, { integer, label });
    if (res.error) errors[key] = res.error;
    else p[key] = res.value;
  }

  // Durée moyenne de séjour : facultative (vide = valeur du marché).
  if (raw.avgStay === '' || raw.avgStay === undefined || raw.avgStay === null) {
    p.avgStay = null;
  } else {
    const res = readRange(raw.avgStay, 'avgStay', r.avgStay, { label: 'Durée moyenne de séjour' });
    if (res.error) errors.avgStay = res.error;
    else p.avgStay = res.value;
  }

  // Mois disponibles : nombre de mois OU sélection exacte.
  const mode = raw.monthsMode === 'select' ? 'select' : 'count';
  p.monthsMode = mode;
  if (mode === 'count') {
    const res = readRange(raw.monthsCount, 'monthsCount', r.months, { integer: true, label: 'Mois disponibles' });
    if (res.error) errors.monthsCount = res.error;
    else p.monthsCount = res.value;
    p.monthsSelected = [];
  } else {
    const sel = Array.isArray(raw.monthsSelected) ? raw.monthsSelected : [];
    const clean = [...new Set(sel.map(Number).filter((m) => Number.isInteger(m) && m >= 0 && m <= 11))].sort((a, b) => a - b);
    if (clean.length === 0) errors.monthsSelected = 'Sélectionnez au moins un mois disponible.';
    p.monthsSelected = clean;
    p.monthsCount = clean.length;
  }

  p.location = config.location.levels[raw.location] ? raw.location : config.location.default;
  if (raw.location && !config.location.levels[raw.location]) {
    warnings.push({ field: 'location', message: 'Emplacement inconnu : « Standard » utilisé.' });
  }

  const known = new Set(config.amenities.items.map((a) => a.id));
  const amen = Array.isArray(raw.amenities) ? raw.amenities : [];
  p.amenities = [...new Set(amen.filter((id) => known.has(id)))];
  if (amen.some((id) => !known.has(id))) warnings.push({ field: 'amenities', message: 'Équipement inconnu ignoré.' });

  p.vat = raw.vat === true;

  // Cohérences (avertissements, sans effet sur le calcul).
  if (isNum(p.bedrooms) && isNum(p.guests) && p.guests > 2 * p.bedrooms + 2) {
    warnings.push({ field: 'guests', message: `Capacité élevée pour ${p.bedrooms} chambre(s) : vérifiez le couchage.` });
  }
  const t = config.types[p.type];
  if (t && isNum(p.bedrooms) && (p.bedrooms < t.expectedBedrooms[0] || p.bedrooms > t.expectedBedrooms[1])) {
    warnings.push({ field: 'type', message: `Type « ${t.label} » inhabituel avec ${p.bedrooms} chambre(s). Le calcul se base sur le nombre de chambres.` });
  }

  return { ok: Object.keys(errors).length === 0, property: p, errors, warnings };
}

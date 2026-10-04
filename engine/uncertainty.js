// Incertitude de l'estimation et niveau de confiance (phase 5 → engine 1.2.0).
// Principe :
//  1. on détecte des FACTEURS d'incertitude (marché, profil côtier, logement, saisonnalité, commune) ;
//  2. CONFIANCE : chaque facteur a un poids ; les facteurs d'un même GROUPE ne s'additionnent pas librement
//     (maximum par groupe, plafond par groupe) afin d'éviter le double comptage ; score total → HIGH / MEDIUM / LOW ;
//     certains facteurs imposent LOW quel que soit le score ;
//  3. INCERTITUDE : base selon le profil (urbain / côtier), puis composantes indépendantes combinées en somme
//     quadratique (pas d'addition linéaire), planchers éventuels, plafond global.
// Tous les seuils et poids sont dans config.json → uncertainty. Le résultat ne constitue pas une garantie.
import { isNum, clamp } from './safe.js';
import { bedroomsKey } from './inputs.js';

export function roundTo(n, step) {
  return Math.round(n / step) * step;
}

// Profil du logement par rapport à la configuration typique de sa taille.
export function propertyProfile(p, config) {
  const ref = config.size.bedrooms[bedroomsKey(p.bedrooms)];
  const u = config.uncertainty.property;
  const areaRatio = p.area / ref.typicalArea;
  const extraGuests = p.guests - ref.typicalGuests;
  const capacityLimit = 2 * p.bedrooms + 2;
  return {
    sizeClass: p.bedrooms === 0 ? 'studio' : p.bedrooms >= u.largeFromBedrooms ? 'large' : 'standard',
    areaRatio,
    extraGuests,
    capacityLimit,
    capacity: p.guests > capacityLimit || extraGuests >= u.capacityVeryAtypicalExtraGuests ? 'very_atypical' : extraGuests > u.capacityAtypicalExtraGuests ? 'atypical' : 'ok',
    area: areaRatio < u.areaVeryAtypical[0] || areaRatio > u.areaVeryAtypical[1] ? 'very_atypical' : areaRatio < u.areaAtypical[0] || areaRatio > u.areaAtypical[1] ? 'atypical' : 'ok'
  };
}

// Liste des facteurs détectés (déterministe). Chaque facteur : groupe, poids de confiance, composante d'incertitude (%), raison lisible.
export function detectFactors({ property, prop, marketQuality, seasonality, profileId, communeId }, config) {
  const U = config.uncertainty;
  const W = U.weights;
  const C = U.components;
  const f = [];
  const add = (id, group, weight, componentPct, reason, hardLow = false, floorPct = 0) => f.push({ id, group, weight, componentPct, reason, hardLow, floorPct });

  // Marché
  if (marketQuality.freshness === 'orange') add('data_age', 'market', W.dataOrange, C.dataOrange, `Données de marché datant de ${marketQuality.freshnessMonths} mois (dernière publication disponible)`);
  if (marketQuality.freshness === 'red') add('data_too_old', 'market', W.dataRed, C.dataRed, `Données de marché trop anciennes (${marketQuality.freshnessMonths} mois)`, true);
  if (isNum(marketQuality.sampleNights) && marketQuality.sampleNights > 0 && marketQuality.sampleNights < U.smallMarketNights) add('small_market', 'market', W.smallMarket, C.smallMarket, `Marché de petite taille (${Math.round(marketQuality.sampleNights).toLocaleString('fr-FR')} nuits réservées sur la période)`);
  if (marketQuality.geoRole === 'epci_voisin') add('neighbour_market', 'market', W.neighbourMarket, C.neighbourMarket, 'Données d\'un marché voisin (pas de donnée pour l\'intercommunalité de la commune)');
  if (marketQuality.geoRole === 'departement') add('department_market', 'market', W.departmentMarket, C.departmentMarket, 'Données départementales uniquement', true);
  if (marketQuality.origin === 'snapshot') add('snapshot', 'market', W.snapshot, C.snapshot, 'Données de secours intégrées à l\'outil', true);

  // Profil côtier (mélange de tailles moins certain — D11)
  if (profileId === 'littoral') add('coastal_mix', 'profile', W.coastal, 0, 'Marché côtier : mélange de tailles des logements moins certain');

  // Logement
  if (prop.sizeClass === 'large') add('large', 'property', W.large, C.sizeClass, `Logement de ${property.bedrooms} chambres : moins de références comparables`, false, U.atypicalFloorPct);
  if (prop.sizeClass === 'studio') add('studio', 'property', 0, C.sizeClass, 'Studio : courbe de taille plus sensible');
  if (prop.capacity === 'atypical') add('capacity_atypical', 'property', W.atypical, C.capacityAtypical, `Capacité un peu élevée pour la taille (${property.guests} voyageurs)`, false, U.atypicalFloorPct);
  if (prop.capacity === 'very_atypical') add('capacity_very_atypical', 'property', W.veryAtypical, C.capacityVeryAtypical, `Capacité très inhabituelle pour ${property.bedrooms} chambre(s) (${property.guests} voyageurs)`, false, U.atypicalFloorPct);
  if (prop.area === 'atypical') add('area_atypical', 'property', W.atypical, C.areaAtypical, `Surface éloignée de la surface typique (${property.area} m²)`, false, U.atypicalFloorPct);
  if (prop.area === 'very_atypical') add('area_very_atypical', 'property', W.veryAtypical, C.areaVeryAtypical, `Surface très inhabituelle pour la taille (${property.area} m²)`, false, U.atypicalFloorPct);

  // Saisonnalité
  if (seasonality.fallback) add('season_fallback', 'seasonality', W.seasonFallback, C.seasonFallback, 'Profil saisonnier indisponible : répartition uniforme sur l\'année');

  // Commune périphérique au loyer nettement plus bas que la moyenne de l'intercommunalité (D12 : signalé, non corrigé)
  if ((U.peripheryWatch.communes || []).includes(communeId)) add('periphery', 'commune', W.periphery, C.periphery, U.peripheryWatch.reason);

  return f;
}

// Score de confiance : maximum par groupe pour le logement (une seule « atypie » comptée), somme plafonnée par groupe ailleurs.
export function confidenceScore(factors, config) {
  const caps = config.uncertainty.groupCaps;
  const groups = {};
  for (const x of factors) (groups[x.group] ||= []).push(x);
  let score = 0;
  const detail = {};
  for (const [g, list] of Object.entries(groups)) {
    const weights = list.map((x) => x.weight);
    const s = g === 'property' ? Math.max(...weights) : weights.reduce((a, b) => a + b, 0);
    detail[g] = Math.min(s, caps[g] ?? s);
    score += detail[g];
  }
  return { score, detail };
}

export function getConfidence(input, marketQuality, seasonality, propertyProfileValue, config, ctx = {}) {
  const factors = detectFactors({ property: input, prop: propertyProfileValue, marketQuality, seasonality, profileId: ctx.profileId, communeId: ctx.communeId }, config);
  const { score, detail } = confidenceScore(factors, config);
  const T = config.uncertainty.levels;
  const hardLow = factors.some((x) => x.hardLow);
  let level = hardLow || score >= T.lowFromScore ? 'LOW' : score >= T.mediumFromScore ? 'MEDIUM' : 'HIGH';
  const reasons = factors.filter((x) => x.weight > 0 || x.hardLow).map((x) => x.reason);
  if (level === 'HIGH') {
    reasons.push(ctx.profileId === 'littoral' ? 'Marché documenté' : 'Marché urbain bien documenté');
    if (propertyProfileValue.sizeClass !== 'large' && propertyProfileValue.capacity === 'ok' && propertyProfileValue.area === 'ok') reasons.push('Typologie cohérente avec les données de calibration');
    if (!seasonality.fallback) reasons.push('Saisonnalité mensuelle disponible');
  }
  return { level, score, groupScores: detail, hardLow, reasons, factors };
}

// Incertitude en % : base du profil, composantes en somme quadratique, planchers, plafond.
export function getUncertainty(factors, profileId, config) {
  const U = config.uncertainty;
  const base = U.basePct[profileId] ?? U.basePct.urbain;
  const comps = factors.filter((x) => x.componentPct > 0).map((x) => x.componentPct);
  const combined = Math.sqrt(base * base + comps.reduce((s, c) => s + c * c, 0));
  const floor = Math.max(0, ...factors.map((x) => x.floorPct || 0));
  const pctExact = clamp(Math.max(combined, floor), base, U.capPct);
  return { basePct: base, components: factors.filter((x) => x.componentPct > 0).map((x) => ({ id: x.id, pct: x.componentPct })), floorPct: floor, pctExact, pct: Math.round(pctExact) };
}

// Fourchette arrondie à la centaine (affichage) ; calculs internes conservés.
export function buildRange(central, pct, step) {
  const low = central * (1 - pct / 100);
  const high = central * (1 + pct / 100);
  return { central: roundTo(central, step), low: roundTo(low, step), high: roundTo(high, step), exact: { central, low, high } };
}

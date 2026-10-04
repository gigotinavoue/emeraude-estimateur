// Calculs de base : ADR, occupation, saisonnalité, nuits, chiffre d'affaires et répartition.
// Règle absolue : les frais de ménage ne sont JAMAIS intégrés au prix par nuit ni au CA des nuits.
import { clamp, isNum, sum } from './safe.js';
import { bedroomsKey } from './inputs.js';

// ---------- ADR ----------
// base.adr est utilisé tel quel (décision D8 : aucune correction du ménage tant que la source ne le précise pas).
export function computeAdr(base, adjustments, managementAdr, emeraudeAdrFactor, config) {
  const bedroom = adjustments.find((a) => a.id === 'bedrooms');
  const bedroomFactor = bedroom ? bedroom.factor : 1;
  let secondaryRaw = 1;
  for (const a of adjustments) if (isNum(a.secondary)) secondaryRaw *= 1 + a.secondary;
  secondaryRaw *= 1 + managementAdr;
  const [lo, hi] = config.guards.adrSecondaryMultiplier;
  const secondary = clamp(secondaryRaw, lo, hi);
  const adr = base.adr * bedroomFactor * secondary * emeraudeAdrFactor;
  return { adr, bedroomFactor, secondaryRaw, secondary, secondaryCapped: Math.abs(secondary - secondaryRaw) > 1e-9 };
}

// ---------- Occupation ----------
export function computeOccupancy(base, adjustments, scenarioDeltaPts, emeraudeOccFactor, config) {
  const pts = sum(adjustments.map((a) => (isNum(a.occPts) ? a.occPts : 0)));
  const maxDev = config.guards.occupancyMaxDeviationPts / 100;
  let occ = base.occupancy + pts / 100;
  const beforeDev = occ;
  occ = clamp(occ, base.occupancy - maxDev, base.occupancy + maxDev);
  occ = occ + scenarioDeltaPts / 100;
  occ = occ * emeraudeOccFactor;
  const [lo, hi] = config.guards.occupancy;
  const final = clamp(occ, lo, hi);
  return { occupancy: final, adjustmentPts: pts, deviationCapped: Math.abs(beforeDev - clamp(beforeDev, base.occupancy - maxDev, base.occupancy + maxDev)) > 1e-9, guardCapped: Math.abs(final - occ) > 1e-9 };
}

// ---------- Saisonnalité ----------
export function flatProfile(reason) {
  return { id: 'uniforme', label: 'Sans saisonnalité', basis: reason, occupancyIndex: Array(12).fill(1), adrIndex: Array(12).fill(1), fallback: true, sources: [] };
}

export function checkSeasonalProfile(p, config) {
  const days = config.months.referenceYearDays;
  const v = config.validation;
  if (!p || !Array.isArray(p.occupancyIndex) || !Array.isArray(p.adrIndex)) return 'profil absent';
  if (p.occupancyIndex.length !== 12 || p.adrIndex.length !== 12) return 'profil incomplet (12 mois attendus)';
  for (const x of [...p.occupancyIndex, ...p.adrIndex]) {
    if (!isNum(x) || x < v.seasonalIndex[0] || x > v.seasonalIndex[1]) return 'indice mensuel hors limites';
  }
  const sO = sum(p.occupancyIndex.map((x, i) => x * days[i]));
  if (Math.abs(sO / 365 - 1) > v.seasonalNormalisationTolerance) return 'indices d\'occupation non normalisés';
  const w = p.occupancyIndex.map((x, i) => x * days[i]);
  const sA = sum(w.map((x, i) => x * p.adrIndex[i])) / sum(w);
  if (Math.abs(sA - 1) > v.seasonalNormalisationTolerance) return 'indices de prix non normalisés';
  return null;
}

export function seasonalProfile(profileId, market, config) {
  const p = market && market.seasonality ? market.seasonality[profileId] : null;
  const problem = checkSeasonalProfile(p, config);
  if (problem) return flatProfile(`Profil « ${profileId} » indisponible (${problem}) : répartition uniforme sur l'année.`);
  return { id: profileId, label: p.label || profileId, basis: p.basis || '', occupancyIndex: p.occupancyIndex, adrIndex: p.adrIndex, fallback: false, sources: p.sources || [], period: p.period || '' };
}

// ---------- Nuits ----------
export function computeNights(p, adr, occupancy, profile, config) {
  const days = config.months.referenceYearDays;
  const cap = config.guards.monthlyOccupancyMax;
  const selected = new Set(p.monthsMode === 'select' ? p.monthsSelected : []);
  const monthly = days.map((d, m) => {
    const occ = Math.min(cap, occupancy * profile.occupancyIndex[m]);
    const adrM = adr * profile.adrIndex[m];
    const booked = d * occ;
    return { month: m, days: d, occupancy: occ, adr: adrM, nightsBooked: booked, nightsRevenue: booked * adrM, included: p.monthsMode === 'select' ? selected.has(m) : true };
  });
  let nightsAvailable;
  let nightsBooked;
  let nightsRevenue;
  if (p.monthsMode === 'select') {
    const inc = monthly.filter((x) => x.included);
    nightsAvailable = sum(inc.map((x) => x.days));
    nightsBooked = sum(inc.map((x) => x.nightsBooked));
    nightsRevenue = sum(inc.map((x) => x.nightsRevenue));
  } else {
    const f = p.monthsCount / 12;
    nightsAvailable = p.monthsCount * 365 / 12;
    nightsBooked = sum(monthly.map((x) => x.nightsBooked)) * f;
    nightsRevenue = sum(monthly.map((x) => x.nightsRevenue)) * f;
  }
  return {
    mode: p.monthsMode,
    monthsCount: p.monthsCount,
    nightsAvailable,
    nightsBooked,
    nightsRevenue,
    adrEffective: nightsBooked > 0 ? nightsRevenue / nightsBooked : adr,
    occupancyEffective: nightsAvailable > 0 ? nightsBooked / nightsAvailable : 0,
    monthly
  };
}

// ---------- Répartition financière ----------
// Le CA des nuits et le ménage restent deux objets distincts ; seule l'assiette des frais Airbnb les combine, explicitement.
export function computeFinancials(nights, p, avgStay, config) {
  const rate = config.fees.airbnbHostFeeRate;
  const nightsRevenue = nights.nightsRevenue;
  const stays = Math.round(nights.nightsBooked / avgStay);
  const cleaningCollected = stays * p.cleaningFee;

  const hostFeeNights = nightsRevenue * rate;
  const hostFeeCleaning = config.fees.airbnbFeeBase === 'nights_plus_cleaning' ? cleaningCollected * rate : 0;
  const vatRate = p.vat ? config.fees.vat.rate : 0;
  const vatOnNightsFee = hostFeeNights * vatRate;
  const vatOnCleaningFee = hostFeeCleaning * vatRate;

  const nightsNetOfHostFee = nightsRevenue - hostFeeNights;
  let commissionBase;
  if (config.commission.base === 'nights_gross') commissionBase = nightsRevenue;
  else commissionBase = nightsNetOfHostFee; // D2 : revenu des nuits net des frais Airbnb sur les nuits
  const commissionRate = p.commissionPct / 100;
  const commission = commissionBase * commissionRate;

  let ownerIncome = nightsNetOfHostFee - vatOnNightsFee - commission;
  let cleaningNetForEmeraude;
  if (config.fees.cleaningFeeShareBearer === 'owner') {
    ownerIncome -= hostFeeCleaning + vatOnCleaningFee;
    cleaningNetForEmeraude = cleaningCollected;
  } else {
    cleaningNetForEmeraude = cleaningCollected - hostFeeCleaning - vatOnCleaningFee; // D1
  }

  const months = nights.monthsCount;
  return {
    nightsRevenue,
    nightsRevenueMonthlyAverage: nightsRevenue / months,
    cleaning: { avgStay, stays, feePerStay: p.cleaningFee, collected: cleaningCollected, hostFee: hostFeeCleaning, vatOnHostFee: vatOnCleaningFee, netForEmeraude: cleaningNetForEmeraude, bearer: config.fees.cleaningFeeShareBearer },
    airbnb: { rate, onNights: hostFeeNights, onCleaning: hostFeeCleaning, vatEnabled: p.vat, vatRate: config.fees.vat.rate, vatOnNightsFee, vatOnCleaningFee },
    nightsNetOfHostFee,
    commission: { rate: commissionRate, base: commissionBase, amount: commission },
    ownerIncome,
    ownerIncomeMonthlyAverage: ownerIncome / months,
    emeraude: { commission, cleaningNet: cleaningNetForEmeraude, total: commission + cleaningNetForEmeraude }
  };
}

// ---------- Recalage marché → logement de référence ----------
// La moyenne publiée porte sur un mélange de tailles. Contrainte de cohérence : appliqué au mélange de marché,
// le modèle doit restituer la moyenne observée. On divise donc le prix par l'indice de prix moyen du mélange
// (pondéré par les nuits) et on corrige l'occupation de l'écart moyen dû à la taille (pondéré par les annonces).
export function referenceCalibration(entry, profileId, config) {
  const rc = config.referenceCalibration;
  const none = { applied: false, adrDivisor: 1, occShiftPts: 0, label: '', mixLabel: '' };
  if (!rc || !rc.enabled) return none;
  if (Array.isArray(entry.segmentedBy) && entry.segmentedBy.includes('bedrooms')) return none;
  const mix = rc.mixByProfile[profileId] || rc.mixByProfile.urbain;
  if (!mix) return none;
  const curve = config.size.bedrooms;
  let wN = 0;
  let wL = 0;
  let adrIdx = 0;
  let occPts = 0;
  for (const k of Object.keys(curve)) {
    const n = mix.nightsShare[k] || 0;
    const l = mix.listingShare[k] || 0;
    adrIdx += n * curve[k].adr;
    occPts += l * curve[k].occPts;
    wN += n;
    wL += l;
  }
  if (!(wN > 0) || !(wL > 0)) return none;
  return { applied: true, adrDivisor: adrIdx / wN, occShiftPts: -occPts / wL, label: rc.label, mixLabel: mix.label };
}

// ---------- Calibration Émeraude ----------
export function emeraudeCalibration(market, geoKey, bedrooms, config) {
  const none = { level: 'aucune', label: 'Aucune donnée interne', listings: 0, weight: 0, adrFactor: 1, occFactor: 1, applied: false };
  const segs = (market && market.emeraude && Array.isArray(market.emeraude.segments)) ? market.emeraude.segments : [];
  const seg = segs.find((s) => s.key === `${geoKey}|bedrooms:${bedroomsKey(bedrooms)}`);
  if (!seg || !isNum(seg.listings) || !isNum(seg.ratioAdr) || !isNum(seg.ratioOcc) || seg.ratioAdr <= 0 || seg.ratioOcc <= 0) return none;
  const levels = [...config.emeraude.levels].sort((a, b) => a.minListings - b.minListings);
  let level = levels[0];
  for (const l of levels) if (seg.listings >= l.minListings) level = l;
  const n = seg.listings;
  const weight = Math.min(level.maxWeight, n / (n + config.emeraude.weightHalfSaturation));
  const eff = (ratio) => 1 + clamp(weight * (ratio - 1), -level.maxEffect, level.maxEffect);
  return { level: level.id, label: level.label, listings: n, weight, adrFactor: eff(seg.ratioAdr), occFactor: eff(seg.ratioOcc), applied: weight > 0 };
}

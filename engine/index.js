// Point d'entrée unique du moteur : estimate(raw, ctx).
// ctx = { config, communes, sources, marketSources: [{ origin: 'remote'|'cache'|'snapshot', data, note? }], today: Date }
import { clamp, isNum, findInvalidValues } from './safe.js';
import { validateInputs } from './inputs.js';
import { resolveMarket } from './resolveMarket.js';
import { sizeAdjustments, locationAdjustment, amenityAdjustment } from './adjustments.js';
import { computeAdr, computeOccupancy, seasonalProfile, computeNights, computeFinancials, emeraudeCalibration, referenceCalibration } from './core.js';
import { freshness, confidence, describePeriod, formatMonthYear } from './quality.js';
import { propertyProfile, getConfidence, getUncertainty, buildRange, roundTo } from './uncertainty.js';

export const ENGINE_VERSION = '1.2.0';
const LEVEL_FR = { HIGH: 'elevee', MEDIUM: 'moyenne', LOW: 'faible' };
const SCENARIO_IDS = ['prudent', 'realiste', 'performant'];

function scenarioDelta(entry, market, config) {
  const cfg = config.scenarios.occupancyDeltaPts;
  let raw = entry.occupancyYoyPts;
  let from = 'marché retenu';
  if (!isNum(raw)) {
    const dep = market.markets && market.markets['departement:35'];
    raw = dep && isNum(dep.occupancyYoyPts) ? dep.occupancyYoyPts : null;
    from = 'département (donnée du marché retenu absente)';
  }
  if (!isNum(raw)) return { pts: cfg.min, observedPts: null, source: 'minimum de configuration (aucune variation publiée)' };
  return { pts: clamp(Math.abs(raw), cfg.min, cfg.max), observedPts: raw, source: from };
}

function originLabel(origin) {
  return { remote: 'Données en ligne', cache: 'Dernières données enregistrées sur cet appareil', snapshot: 'Données de secours intégrées à l\'outil' }[origin] || origin;
}

export function estimate(raw, ctx) {
  const { config, communes, sources } = ctx;
  const today = ctx.today instanceof Date ? ctx.today : new Date();
  const v = validateInputs(raw, config, communes);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
  const p = v.property;

  // 1. Résolution du marché, source après source (en ligne → cache → secours).
  const dataNotes = [];
  let res = null;
  let used = null;
  for (const ms of ctx.marketSources || []) {
    if (!ms || !ms.data) {
      if (ms && ms.note) dataNotes.push(ms.note);
      continue;
    }
    const r = resolveMarket(p.commune, ms.data, communes, config);
    if (r && r.entry) {
      res = r;
      used = ms;
      break;
    }
    dataNotes.push(`${originLabel(ms.origin)} : aucune base valide pour cette commune.`);
  }
  if (!res) {
    return { ok: false, errors: { _global: 'Aucune donnée de marché utilisable pour cette commune. L\'estimation ne peut pas être calculée.' }, warnings: v.warnings, dataNotes };
  }
  const market = used.data;
  const entry = res.entry;
  // Valeurs de marché OBSERVÉES (affichées telles quelles) puis base de modélisation (logement de référence).
  const observed = { adr: entry.adr, occupancy: entry.occupancy, avgStay: entry.avgStay };
  const refCal = referenceCalibration(entry, res.commune.profile, config);
  const base = { adr: observed.adr / refCal.adrDivisor, occupancy: observed.occupancy + refCal.occShiftPts / 100, avgStay: observed.avgStay };
  const segmentedBy = Array.isArray(entry.segmentedBy) ? entry.segmentedBy : [];
  const definitions = Object.assign({}, (sources.sources[entry.source] || {}).definitions || {}, entry.definitions || {});
  const sourceInfo = sources.sources[entry.source] || { label: entry.source, attribution: entry.source };

  // 2. Éléments communs aux scénarios.
  const profile = seasonalProfile(res.commune.profile, market, config);
  const calibration = emeraudeCalibration(market, res.key, p.bedrooms, config);
  const avgStay = isNum(p.avgStay) ? p.avgStay : base.avgStay;
  const delta = scenarioDelta(entry, market, config);

  // 3. Calcul par scénario.
  const scenarios = {};
  for (const id of SCENARIO_IDS) {
    const sc = config.scenarios[id];
    const adjustments = [
      ...sizeAdjustments(p, config, segmentedBy),
      locationAdjustment(p, config, sc.positiveBonusFactor),
      amenityAdjustment(p, config, sc.positiveBonusFactor)
    ];
    const adrR = computeAdr(base, adjustments, sc.managementAdr, calibration.adrFactor, config);
    const occR = computeOccupancy(base, adjustments, sc.occupancyDeltaSign * delta.pts, calibration.occFactor, config);
    const nights = computeNights(p, adrR.adr, occR.occupancy, profile, config);
    const fin = computeFinancials(nights, p, avgStay, config);
    scenarios[id] = {
      id,
      label: sc.label,
      description: sc.description,
      adrAnnual: adrR.adr,
      occupancyAnnual: occR.occupancy,
      adr: nights.adrEffective,
      occupancy: nights.occupancyEffective,
      monthsMode: nights.mode,
      monthsCount: nights.monthsCount,
      nightsAvailable: nights.nightsAvailable,
      nightsBooked: nights.nightsBooked,
      monthly: nights.monthly,
      ...fin,
      model: {
        bedroomFactor: adrR.bedroomFactor,
        secondaryMultiplier: adrR.secondary,
        secondaryMultiplierRaw: adrR.secondaryRaw,
        secondaryCapped: adrR.secondaryCapped,
        occupancyAdjustmentPts: occR.adjustmentPts,
        occupancyDeviationCapped: occR.deviationCapped,
        occupancyGuardCapped: occR.guardCapped,
        scenarioDeltaPts: sc.occupancyDeltaSign * delta.pts,
        managementAdr: sc.managementAdr,
        positiveBonusFactor: sc.positiveBonusFactor
      },
      adjustments: [
        ...(refCal.applied ? [{
          id: 'reference',
          label: refCal.label,
          kind: 'hypothese_emeraude',
          adrEffectPct: (1 / refCal.adrDivisor - 1) * 100,
          occEffectPts: refCal.occShiftPts,
          detail: refCal.mixLabel
        }] : []),
        ...adjustments.map((a) => ({
          id: a.id,
          label: a.label,
          kind: a.kind,
          adrEffectPct: a.id === 'bedrooms' ? (a.factor - 1) * 100 : (a.secondary || 0) * 100,
          occEffectPts: a.occPts || 0,
          detail: a.detail || ''
        }))
      ]
    };
  }
  const order = SCENARIO_IDS.map((id) => scenarios[id].nightsRevenue);
  const warnings = [...v.warnings];
  if (!(order[0] <= order[1] + 1e-6 && order[1] <= order[2] + 1e-6)) warnings.push({ field: '_scenarios', message: 'Ordre des scénarios inattendu.' });
  if (profile.fallback) warnings.push({ field: '_seasonality', message: profile.basis });

  // 4. Données, fraîcheur, confiance.
  const fr = freshness(entry.period, entry.publishedAt, today, config);
  // Confiance et incertitude (engine 1.2.0). Les configurations antérieures sans section « uncertainty » gardent l'ancienne règle.
  let conf;
  let summary;
  if (config.uncertainty) {
    const prop = propertyProfile(p, config);
    const marketQuality = { freshness: fr.level, freshnessMonths: fr.months, sampleNights: entry.sample && entry.sample.nightsBooked, geoRole: res.geoRole, origin: used.origin };
    const c = getConfidence(p, marketQuality, profile, prop, config, { profileId: res.commune.profile, communeId: res.commune.id });
    const unc = getUncertainty(c.factors, res.commune.profile, config);
    const step = config.uncertainty.roundingStep;
    const realS = scenarios.realiste;
    const rev = buildRange(realS.nightsRevenue, unc.pct, step);
    const own = buildRange(realS.ownerIncome, unc.pct, step);
    conf = { level: LEVEL_FR[c.level], label: config.confidence.labels[LEVEL_FR[c.level]], reasons: c.reasons };
    summary = {
      basis: 'CA des nuits, scénario réaliste',
      central: rev.central,
      low: rev.low,
      high: rev.high,
      uncertaintyPct: unc.pct,
      confidence: c.level,
      confidenceReasons: c.reasons,
      uncertaintyReasons: c.factors.filter((x) => x.componentPct > 0).map((x) => x.reason),
      owner: { central: own.central, low: own.low, high: own.high },
      adr: Math.round(realS.adr),
      occupancyPct: Math.round(realS.occupancy * 100),
      scenarios: Object.fromEntries(SCENARIO_IDS.map((id) => [id, roundTo(scenarios[id].nightsRevenue, step)])),
      notes: { range: config.uncertainty.texts.rangeNote, scenarios: config.uncertainty.texts.scenariosNote },
      model: {
        uncertaintyBasePct: unc.basePct,
        uncertaintyExactPct: unc.pctExact,
        uncertaintyFloorPct: unc.floorPct,
        uncertaintyComponents: unc.components,
        confidenceScore: c.score,
        confidenceGroupScores: c.groupScores,
        confidenceHardLow: c.hardLow,
        propertyProfile: prop,
        exact: rev.exact
      }
    };
  } else {
    conf = confidence({ geoRole: res.geoRole, origin: used.origin, sampleNights: entry.sample && entry.sample.nightsBooked, freshnessLevel: fr.level }, config);
  }
  const fallbackMessages = [];
  for (const n of dataNotes) fallbackMessages.push(n);
  if (used.origin !== 'remote') fallbackMessages.push(`${originLabel(used.origin)}${used.savedAt ? ` (enregistrées le ${used.savedAt})` : ''}.`);
  if (res.geoRole === 'epci_voisin') fallbackMessages.push(`Pas de donnée valide pour ${res.ownEpciLabel} : marché voisin utilisé (${entry.label}).`);
  if (res.geoRole === 'departement') fallbackMessages.push(`Pas de donnée intercommunale valide : données départementales utilisées (${entry.label}).`);
  for (const r of res.fallbackReasons) if (!fallbackMessages.some((m) => m.includes(r.key))) fallbackMessages.push(`Écartée : ${r.key} (${r.reason}).`);

  const real = scenarios.realiste;
  const explanation = {
    market: {
      title: '1. Données de marché (observées)',
      intro: config.texts.methodologyMarket,
      lines: [
        { label: 'Zone', value: entry.label },
        { label: 'Prix moyen par nuit (marché)', value: observed.adr, unit: 'EUR' },
        { label: 'Taux d\'occupation (marché)', value: observed.occupancy, unit: 'ratio' },
        { label: 'Durée moyenne de séjour (marché)', value: observed.avgStay, unit: 'nights' },
        { label: 'Période', value: describePeriod(entry.period) },
        { label: 'Source', value: sourceInfo.attribution || sourceInfo.label }
      ],
      definitionNotes: [
        definitions.adrIncludesCleaning === 'unknown' ? config.cleaning.unknownDefinitionNote : '',
        definitions.occupancyBasis === 'unknown' ? 'La source ne précise pas si le taux d\'occupation exclut les nuits bloquées par les propriétaires.' : ''
      ].filter(Boolean)
    },
    adjustments: {
      title: '2. Ajustements du modèle Émeraude (hypothèses)',
      intro: config.texts.methodologyAdjustments,
      reference: config.referenceProperty.description + (refCal.applied ? ` ${config.referenceCalibration.description}` : ''),
      items: real.adjustments,
      guards: [
        real.model.secondaryCapped ? 'Plafond global des ajustements de prix appliqué.' : '',
        real.model.occupancyDeviationCapped ? `Écart d'occupation limité à ±${config.guards.occupancyMaxDeviationPts} points autour du marché.` : '',
        real.model.occupancyGuardCapped ? 'Occupation bornée par les garde-fous.' : ''
      ].filter(Boolean),
      seasonality: { label: profile.label, basis: profile.basis, fallback: profile.fallback },
      months: p.monthsMode === 'select'
        ? `Mois disponibles sélectionnés : ${p.monthsSelected.map((m) => config.months.labels[m]).join(', ')}.`
        : `${p.monthsCount} mois disponibles. ${config.months.countModeNote}`,
      calibration: calibration.applied ? `Calibration sur ${calibration.listings} logements gérés par Émeraude (poids ${(calibration.weight * 100).toFixed(0)} %).` : 'Aucune calibration par les données internes Émeraude.',
      scenarios: `Écart de scénario : ±${delta.pts} points d'occupation (${delta.observedPts !== null ? `variation annuelle observée ${delta.observedPts} pts, ${delta.source}` : delta.source}, borné entre ${config.scenarios.occupancyDeltaPts.min} et ${config.scenarios.occupancyDeltaPts.max}).`
    },
    result: {
      title: '3. Résultat estimé pour ce logement',
      intro: config.texts.methodologyResult,
      lines: [
        { label: 'Prix moyen par nuit estimé', value: real.adr, unit: 'EUR' },
        { label: 'Taux d\'occupation estimé', value: real.occupancy, unit: 'ratio' },
        { label: 'CA des nuits estimé', value: real.nightsRevenue, unit: 'EUR' }
      ]
    }
  };

  const result = {
    ok: true,
    engineVersion: ENGINE_VERSION,
    configVersion: config.version,
    errors: {},
    warnings,
    property: {
      commune: res.commune.label,
      type: config.types[p.type].label,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      area: p.area,
      guests: p.guests,
      location: config.location.levels[p.location].label,
      amenities: p.amenities,
      monthsMode: p.monthsMode,
      monthsCount: p.monthsCount,
      monthsSelected: p.monthsSelected,
      commissionPct: p.commissionPct,
      cleaningFee: p.cleaningFee,
      avgStayUsed: avgStay,
      avgStaySource: isNum(p.avgStay) ? 'saisie' : 'marché',
      vat: p.vat
    },
    data: {
      origin: used.origin,
      originLabel: originLabel(used.origin),
      marketKey: res.key,
      geoRole: res.geoRole,
      zone: entry.label,
      source: { id: entry.source, label: sourceInfo.label, attribution: sourceInfo.attribution || sourceInfo.label },
      period: entry.period,
      periodText: describePeriod(entry.period),
      publishedAt: entry.publishedAt || '',
      publishedText: entry.publishedAt ? formatMonthYear(entry.publishedAt) : 'non précisée',
      market: { adr: observed.adr, occupancy: observed.occupancy, avgStay: observed.avgStay, referenceAdr: base.adr, referenceOccupancy: base.occupancy, referenceCalibrated: refCal.applied, sampleNights: (entry.sample && entry.sample.nightsBooked) || 0, occupancyYoyPts: isNum(entry.occupancyYoyPts) ? entry.occupancyYoyPts : 0 },
      definitions: { adrIncludesCleaning: String(definitions.adrIncludesCleaning || 'unknown'), occupancyBasis: String(definitions.occupancyBasis || 'unknown') },
      freshness: fr,
      confidence: conf,
      fallbackMessages,
      seasonality: { id: profile.id, label: profile.label, basis: profile.basis, fallback: profile.fallback },
      calibration,
      attribution: config.texts.attribution,
      marketGeneratedAt: market.generatedAt || ''
    },
    explanation,
    ...(summary ? { summary } : {}),
    scenarios
  };

  const invalid = findInvalidValues(result);
  if (invalid.length) {
    return { ok: false, errors: { _global: 'Calcul interrompu : une valeur incohérente a été détectée. Vérifiez les données saisies.' }, warnings, debug: invalid.slice(0, 10) };
  }
  return result;
}

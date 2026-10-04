// Contrôles avant acceptation (fonctions pures, testables sans réseau).
// Niveaux : ACCEPT < REVIEW < REJECT. « SIGNAL » = variation notable mais normale (acceptée, mentionnée au rapport).
import crypto from 'node:crypto';
import { lastPeriod } from './fetch-sources.mjs';
import { parseCity, parseRegion } from '../adapters/eurostat.mjs';
import { parseHotels } from '../adapters/insee.mjs';

export const LEVELS = ['ACCEPT', 'REVIEW', 'REJECT'];
export const worst = (list) => list.reduce((a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a), 'ACCEPT');
const r1 = (x) => Math.round(x * 10) / 10;

// Observations utiles d'un fichier brut, selon le type de source.
export function parseRaw(kind, raw) {
  if (!raw) return [];
  if (kind === 'eurostat_city') return parseCity(raw).filter((o) => o.metric === 'stays' || o.metric === 'nightsBooked');
  if (kind === 'eurostat_region') return parseRegion(raw);
  if (kind === 'insee') return parseHotels(raw);
  return [];
}

// Empreinte du contenu utile (indépendante de la date de récupération et des horodatages internes de l'API).
export function contentHash(kind, raw) {
  const obs = parseRaw(kind, raw).map((o) => `${o.id}=${o.value}`).sort();
  return crypto.createHash('sha256').update(obs.join('\n')).digest('hex');
}

// Écart en mois entre une période « AAAA » / « AAAA-MM » et une date.
export function lagMonths(period, today) {
  if (!period) return null;
  const [y, m] = period.split('-').map(Number);
  const end = m ? { y, m } : { y, m: 12 };
  return (today.getUTCFullYear() - end.y) * 12 + (today.getUTCMonth() + 1 - end.m);
}

const classify = (value, { review, reject }) => (value > reject ? 'REJECT' : value > review ? 'REVIEW' : 'ACCEPT');

// Contrôle d'une réponse candidate d'une source automatique, comparée à la version active.
export function checkSource(src, candidate, previous, today = new Date()) {
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  const res = { status: 'REJECTED', level: 'REJECT', lastPeriod: null, previousPeriod: previous ? previous.lastPeriod || lastPeriod(previous.data) : null, issues, observations: 0 };
  if (!candidate || !candidate.data || typeof candidate.data !== 'object') {
    add('REJECT', 'réponse vide ou illisible');
    return res;
  }
  const lp = lastPeriod(candidate.data);
  res.lastPeriod = lp;
  if (!lp || !/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(lp)) add('REJECT', `période introuvable ou invalide (${lp})`);
  else if (lagMonths(lp, today) < 0) add('REJECT', `période ${lp} postérieure à la date du jour`);
  if (res.previousPeriod && lp && lp < res.previousPeriod) add('REJECT', `dernière période ${lp} antérieure à la version active (${res.previousPeriod})`);

  const obs = parseRaw(src.kind, { retrievedAt: candidate.retrievedAt, data: candidate.data });
  res.observations = obs.length;
  if (obs.length < src.minObservations) add('REJECT', `données insuffisantes : ${obs.length} observation(s) exploitable(s), minimum ${src.minObservations}`);
  const [lo, hi] = src.valueRange;
  const bad = obs.filter((o) => typeof o.value !== 'number' || !Number.isFinite(o.value) || o.value < lo || o.value > hi);
  if (bad.length) add('REJECT', `${bad.length} valeur(s) hors bornes [${lo} ; ${hi}] (ex. ${bad[0].id} = ${bad[0].value})`);
  if (src.kind === 'eurostat_city' && lp) {
    const hasBoth = ['stays', 'nightsBooked'].every((m) => obs.some((o) => o.metric === m && o.period.start.startsWith(lp)));
    if (!hasBoth) add('REVIEW', `année ${lp} incomplète (séjours ou nuits manquants) : l'année complète précédente reste utilisée`);
  }

  if (previous) {
    const prevObs = parseRaw(src.kind, previous);
    const cand = new Map(obs.map((o) => [o.id, o.value]));
    const missing = prevObs.filter((o) => !cand.has(o.id));
    if (prevObs.length && missing.length / prevObs.length > 0.1) add('REJECT', `${missing.length} observation(s) de la version active absente(s) de la réponse (données tronquées)`);
    else if (missing.length) add('REVIEW', `${missing.length} observation(s) de la version active absente(s) de la réponse`);
    let maxRev = 0;
    let maxId = null;
    for (const o of prevObs) {
      if (!cand.has(o.id)) continue;
      const v = cand.get(o.id);
      const d = src.overlapRevision.reviewPts !== undefined ? Math.abs(v - o.value) * 100 : (Math.abs(v / o.value - 1) * 100);
      if (d > maxRev) { maxRev = d; maxId = o.id; }
    }
    res.maxRevision = { value: r1(maxRev), unit: src.overlapRevision.reviewPts !== undefined ? 'pts' : '%', id: maxId };
    const rv = src.overlapRevision.reviewPts !== undefined ? { review: src.overlapRevision.reviewPts, reject: src.overlapRevision.rejectPts } : { review: src.overlapRevision.reviewPct, reject: src.overlapRevision.rejectPct };
    const lvl = classify(maxRev, rv);
    if (lvl !== 'ACCEPT') add(lvl, `révision des périodes déjà publiées : ${r1(maxRev)} ${res.maxRevision.unit} (${maxId})`);
  }

  res.level = worst(issues.map((i) => i.level));
  if (res.level === 'REJECT') res.status = 'REJECTED';
  else if (previous && contentHash(src.kind, previous) === contentHash(src.kind, { data: candidate.data })) res.status = 'UNCHANGED';
  else if (!res.previousPeriod || (lp && lp > res.previousPeriod)) res.status = 'NEW_PERIOD';
  else res.status = 'REVISION';
  return res;
}

// Comparaison du marché candidat avec le marché actif.
export function compareMarkets(active, candidate, th, validation) {
  const checks = [];
  const add = (level, scope, msg, extra = {}) => checks.push({ level, scope, msg, ...extra });
  if (!candidate || !candidate.markets || !Object.keys(candidate.markets).length) {
    add('REJECT', 'market', 'market.json candidat vide');
    return checks;
  }
  for (const [k, a] of Object.entries(active.markets || {})) {
    const c = candidate.markets[k];
    if (!c) { add('REJECT', k, 'marché présent dans la version active mais absent du candidat'); continue; }
    if (c.adr < validation.adr[0] || c.adr > validation.adr[1] || c.occupancy < validation.occupancy[0] || c.occupancy > validation.occupancy[1] || c.avgStay < validation.avgStay[0] || c.avgStay > validation.avgStay[1]) {
      add('REJECT', k, `valeur hors bornes (prix ${c.adr} €, occupation ${c.occupancy}, séjour ${c.avgStay})`);
      continue;
    }
    const adrPct = Math.abs(c.adr / a.adr - 1) * 100;
    const occPts = Math.abs(c.occupancy - a.occupancy) * 100;
    const stayPct = Math.abs(c.avgStay / a.avgStay - 1) * 100;
    const detail = { before: { adr: a.adr, occupancy: a.occupancy, avgStay: a.avgStay, period: a.period.end }, after: { adr: c.adr, occupancy: c.occupancy, avgStay: c.avgStay, period: c.period.end } };
    for (const [lvl, msg] of [
      [classify(adrPct, th.marketAdrPct), `prix ${a.adr} → ${c.adr} € (${r1(adrPct)} %)`],
      [classify(occPts, th.marketOccupancyPts), `occupation ${r1(a.occupancy * 100)} → ${r1(c.occupancy * 100)} % (${r1(occPts)} pts)`],
      [classify(stayPct, th.marketAvgStayPct), `séjour ${a.avgStay} → ${c.avgStay} nuits (${r1(stayPct)} %)`]
    ]) if (lvl !== 'ACCEPT') add(lvl, k, msg, detail);
    if (a.period.end !== c.period.end) add('REVIEW', k, `changement de millésime de la base : ${a.period.end.slice(0, 4)} → ${c.period.end.slice(0, 4)} (validation humaine attendue)`, detail);
  }
  for (const [id, a] of Object.entries(active.seasonality || {})) {
    const c = (candidate.seasonality || {})[id];
    if (!c) { add('REJECT', `saisonnalité:${id}`, 'profil absent du candidat'); continue; }
    let max = 0;
    for (const f of ['occupancyIndex', 'adrIndex']) for (let i = 0; i < 12; i++) max = Math.max(max, Math.abs(c[f][i] - a[f][i]));
    const lvl = classify(max, th.seasonalIndexAbs);
    if (lvl !== 'ACCEPT') add(lvl, `saisonnalité:${id}`, `indice mensuel modifié de ${Math.round(max * 1000) / 1000} au maximum`);
    else if (max > 0) add('ACCEPT', `saisonnalité:${id}`, `profil actualisé (écart maximal ${Math.round(max * 1000) / 1000})`);
  }
  return checks;
}

// Impact sur les 8 logements de référence (mêmes saisies, même date de calcul, seules les données changent).
export function compareReferences(before, after, th) {
  const rows = [];
  for (const b of before) {
    const a = after.find((x) => x.label === b.label);
    const row = { label: b.label, before: b, after: a || null, level: 'ACCEPT', signal: false, notes: [] };
    rows.push(row);
    if (!a || ![a.nightsRevenue, a.adr, a.occupancyPct, a.central].every(Number.isFinite)) { row.level = 'REJECT'; row.notes.push('résultat absent ou non numérique'); continue; }
    const revPct = (a.nightsRevenue / b.nightsRevenue - 1) * 100;
    const adrPct = (a.adr / b.adr - 1) * 100;
    const occPts = a.occupancyPct - b.occupancyPct;
    row.revenuePct = r1(revPct);
    row.adrPct = r1(adrPct);
    row.occupancyPts = r1(occPts);
    const lv = [classify(Math.abs(revPct), th.referenceRevenuePct), classify(Math.abs(adrPct), th.referenceAdrPct), classify(Math.abs(occPts), th.referenceOccupancyPts)];
    if (a.central < th.referenceCentralBounds[0] || a.central > th.referenceCentralBounds[1]) { lv.push('REJECT'); row.notes.push(`estimation ${a.central} € hors de la plage plausible [${th.referenceCentralBounds.join(' ; ')}]`); }
    row.level = worst(lv);
    row.signal = Math.abs(revPct) >= th.referenceRevenuePct.signal || Math.abs(adrPct) >= th.referenceAdrPct.signal || Math.abs(occPts) >= th.referenceOccupancyPts.signal;
  }
  return rows;
}

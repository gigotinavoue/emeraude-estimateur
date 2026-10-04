// Audit (vérification interne, hors moteur) : structure des prix selon la taille, à partir de fichiers
// Inside Airbnb (licence CC BY 4.0) de villes françaises NON desservies (Bordeaux, Lyon, Pays basque).
// Les fichiers bruts ne sont ni stockés dans le dépôt ni republiés ; seuls des ratios agrégés sont produits.
// Usage : node scripts/audit/structure-check.mjs <dossier contenant ia_<ville>.csv>
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, writeJson } from '../lib/util.mjs';

const num = (s) => {
  const n = Number(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : NaN;
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};

// Régression linéaire multiple par moindres carrés (équations normales, élimination de Gauss).
function ols(X, y) {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b];
      A[a][k] += X[i][a] * y[i];
    }
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

export function analyse(rows) {
  const L = rows
    .map((r) => ({
      roomType: r.room_type, propertyType: r.property_type || '',
      bedrooms: /\bstudio\b/i.test(r.name || '') && num(r.bedrooms) <= 1 ? 0 : num(r.bedrooms), guests: num(r.accommodates), baths: num(r.bathrooms),
      price: num(r.price), occNights: num(r.estimated_occupancy_l365d), revenue: num(r.estimated_revenue_l365d),
      minNights: num(r.minimum_nights), reviewsLtm: num(r.number_of_reviews_ltm)
    }))
    .filter((l) => l.roomType === 'Entire home/apt' && l.minNights < 30 && l.reviewsLtm >= 1 && Number.isFinite(l.bedrooms) && Number.isFinite(l.guests) && l.price > 15 && l.price < 2000);
  const key = (b) => (b >= 4 ? '4+' : String(b));
  const by = {};
  for (const l of L) (by[key(l.bedrooms)] ||= []).push(l);
  const ref = by['1'];
  const refPrice = median(ref.map((l) => l.price));
  const refOcc = median(ref.filter((l) => Number.isFinite(l.occNights)).map((l) => l.occNights / 365));
  const refRev = median(ref.filter((l) => l.revenue > 0).map((l) => l.revenue));
  const bedrooms = {};
  for (const k of ['0', '1', '2', '3', '4+']) {
    const g = by[k] || [];
    const occ = g.filter((l) => Number.isFinite(l.occNights)).map((l) => l.occNights / 365);
    bedrooms[k] = {
      n: g.length,
      medianPriceRatio: Math.round((median(g.map((l) => l.price)) / refPrice) * 100) / 100,
      medianOccupancyPtsVs1: Math.round((median(occ) - refOcc) * 1000) / 10,
      medianRevenueRatio: Math.round((median(g.filter((l) => l.revenue > 0).map((l) => l.revenue)) / refRev) * 100) / 100,
      medianGuests: median(g.map((l) => l.guests)),
      shareHouse: Math.round((g.filter((l) => /home|house|villa|maison/i.test(l.propertyType) && !/rental unit|condo|loft|apartment/i.test(l.propertyType)).length / Math.max(1, g.length)) * 100)
    };
  }
  // Régression : ln(prix) ~ chambres (indicatrices) + écart de capacité à la médiane de la classe + 2 sdb et plus + maison.
  const medG = Object.fromEntries(Object.entries(by).map(([k, g]) => [k, median(g.map((l) => l.guests))]));
  const classes = ['0', '2', '3', '4+'].filter((k) => (by[k] || []).length >= 30);
  const isHouse = (l) => (/home|house|villa|maison/i.test(l.propertyType) && !/rental unit|condo|loft|apartment/i.test(l.propertyType) ? 1 : 0);
  const exp = (x) => Math.round((Math.exp(x) - 1) * 1000) / 10;
  const fit = (subset) => {
    const X = [];
    const y = [];
    for (const l of subset) {
      const k = key(l.bedrooms);
      if (k !== '1' && !classes.includes(k)) continue;
      X.push([1, ...classes.map((c) => (k === c ? 1 : 0)), l.guests - medG[k], Number.isFinite(l.baths) && l.baths >= 2 ? 1 : 0, isHouse(l)]);
      y.push(Math.log(l.price));
    }
    const b = ols(X, y);
    const res = { n: X.length };
    classes.forEach((c, i) => { res[`bedrooms_${c}_vs_1`] = exp(b[1 + i]); });
    res.perExtraGuestWithinClass = exp(b[1 + classes.length]);
    res.twoPlusBathrooms = exp(b[2 + classes.length]);
    res.house = exp(b[3 + classes.length]);
    return res;
  };
  const totalN = L.length;
  const totalNights = L.reduce((s, l) => s + (Number.isFinite(l.occNights) ? l.occNights : 0), 0);
  for (const k of Object.keys(bedrooms)) {
    const g = by[k] || [];
    bedrooms[k].listingShare = Math.round((g.length / totalN) * 1000) / 1000;
    bedrooms[k].nightsShare = Math.round((g.reduce((s, l) => s + (Number.isFinite(l.occNights) ? l.occNights : 0), 0) / totalNights) * 1000) / 1000;
  }
  const q = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  };
  const one = by['1'];
  const prices1 = one.map((l) => l.price);
  const occ1 = one.filter((l) => Number.isFinite(l.occNights)).map((l) => l.occNights / 365);
  const rev1 = one.filter((l) => l.revenue > 0).map((l) => l.revenue);
  const dispersion1BR = {
    note: 'Dispersion à taille égale (1 chambre) : rapport au médian.',
    price: { p25: Math.round((q(prices1, 0.25) / q(prices1, 0.5)) * 100) / 100, p75: Math.round((q(prices1, 0.75) / q(prices1, 0.5)) * 100) / 100, p90: Math.round((q(prices1, 0.9) / q(prices1, 0.5)) * 100) / 100 },
    occupancyPts: { p25: Math.round((q(occ1, 0.25) - q(occ1, 0.5)) * 1000) / 10, p75: Math.round((q(occ1, 0.75) - q(occ1, 0.5)) * 1000) / 10 },
    revenue: { p25: Math.round((q(rev1, 0.25) / q(rev1, 0.5)) * 100) / 100, p75: Math.round((q(rev1, 0.75) / q(rev1, 0.5)) * 100) / 100, p90: Math.round((q(rev1, 0.9) / q(rev1, 0.5)) * 100) / 100 }
  };
  return {
    listings: L.length,
    dispersion1BR,
    bedrooms,
    regression: {
      note: 'Effets en % sur le prix affiché, toutes choses égales par ailleurs (référence : 1 chambre, capacité médiane de la classe, 1 salle de bain, appartement). « house » n\'est pas interprétable si l\'échantillon contient peu de maisons.',
      all: fit(L)
    }
  };
}

if (process.argv[1].endsWith('structure-check.mjs')) {
  const dir = process.argv[2];
  const out = { source: 'Inside Airbnb (CC BY 4.0) — vérification interne, non utilisée par le moteur', files: {}, generatedAt: new Date().toISOString() };
  for (const city of ['bordeaux', 'lyon', 'paysbasque']) {
    const f = path.join(dir, `ia_${city}.csv`);
    if (!fs.existsSync(f)) continue;
    out.files[city] = analyse(parseCsv(fs.readFileSync(f, 'utf8')));
  }
  writeJson('reports/audit-structure-taille.json', out);
  console.log(JSON.stringify(out, null, 2));
}

// Garde-fous numériques : aucune valeur NaN / undefined / null ne doit sortir du moteur.

export function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// Convertit une saisie ("35", "35,5", " 40 ") en nombre ; NaN si invalide.
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function sum(arr) {
  let s = 0;
  for (const x of arr) s += x;
  return s;
}

// Parcourt un objet résultat et liste les chemins invalides (NaN, Infinity, undefined, null).
export function findInvalidValues(obj, path = 'result', out = []) {
  if (obj === undefined || obj === null) {
    out.push(path);
    return out;
  }
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(path);
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findInvalidValues(v, `${path}[${i}]`, out));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findInvalidValues(v, `${path}.${k}`, out);
  }
  return out;
}

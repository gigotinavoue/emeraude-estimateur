// Validateur JSON Schema minimal (sous-ensemble suffisant pour ce projet, sans dépendance).
// Mots-clés pris en charge : type, required, properties, additionalProperties, items, enum, const,
// minimum, maximum, minItems, maxItems, minLength, pattern, patternProperties, anyOf, $ref (local #/definitions/...).

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

export function validateSchema(data, schema, root = schema, path = '$', errors = []) {
  if (schema.$ref) {
    const ref = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], root);
    return validateSchema(data, ref, root, path, errors);
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validateSchema(data, s, root, path, []).length === 0);
    if (!ok) errors.push(`${path} : ne correspond à aucune variante attendue`);
    return errors;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(data, t))) {
      errors.push(`${path} : type ${typeOf(data)} au lieu de ${types.join('|')}`);
      return errors;
    }
  }
  if (schema.const !== undefined && data !== schema.const) errors.push(`${path} : doit valoir ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(data)) errors.push(`${path} : valeur ${JSON.stringify(data)} non autorisée`);
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${path} : ${data} < ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(`${path} : ${data} > ${schema.maximum}`);
  }
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) errors.push(`${path} : chaîne trop courte`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push(`${path} : format invalide (${schema.pattern})`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push(`${path} : au moins ${schema.minItems} éléments attendus`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push(`${path} : au plus ${schema.maxItems} éléments attendus`);
    if (schema.items) data.forEach((v, i) => validateSchema(v, schema.items, root, `${path}[${i}]`, errors));
  }
  if (typeOf(data) === 'object') {
    for (const k of schema.required || []) if (!(k in data)) errors.push(`${path} : champ « ${k} » manquant`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (props[k]) validateSchema(v, props[k], root, `${path}.${k}`, errors);
      else if (schema.patternProperties) {
        const hit = Object.entries(schema.patternProperties).find(([re]) => new RegExp(re).test(k));
        if (hit) validateSchema(v, hit[1], root, `${path}.${k}`, errors);
        else if (schema.additionalProperties === false) errors.push(`${path} : champ « ${k} » non autorisé`);
      } else if (schema.additionalProperties === false) errors.push(`${path} : champ « ${k} » non autorisé`);
      else if (typeof schema.additionalProperties === 'object') validateSchema(v, schema.additionalProperties, root, `${path}.${k}`, errors);
    }
  }
  return errors;
}

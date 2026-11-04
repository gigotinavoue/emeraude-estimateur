// Règle de commission : taux variable × (nuits nettes + ménage net des frais Airbnb) ;
// frais Airbnb sur le ménage à la charge du propriétaire ; ménage brut pour Émeraude ; aucune TVA ajoutée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { computeFinancials } from '../engine/core.js';
import { buildRange } from '../engine/uncertainty.js';
import { estimate } from '../engine/index.js';
import { validateSchema } from '../scripts/lib/schema.mjs';
import { ROOT, J, ctx, baseRaw } from './helpers.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CFG = J('config/config.json');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const GENERATED = ['embed/estimateur-v2.html', 'deploy/estimateur-v2/estimateur-v2-validation.html', 'dist/preview.html', 'dist/estimateur-artifact.html', 'reports/preview-artifact.html'];
const NIGHTS = { nightsRevenue: 1000, nightsBooked: 10, monthsCount: 1 };

test('C1. Exemple chiffré : 1 000 € de nuits, 100 € de ménage, taux de 18 %', () => {
  const f = computeFinancials(NIGHTS, { cleaningFee: 50, commissionPct: 18 }, 5, CFG);
  close(f.airbnb.onNights, 155);
  close(f.airbnb.onCleaning, 15.5);
  close(f.nightsNetOfHostFee, 845);
  close(f.cleaningNetOfHostFee, 84.5);
  close(f.commission.base, 929.5);
  close(f.commission.amount, 167.31);
  close(f.ownerIncome, 662.19);
  close(f.emeraude.cleaningNet, 100);
  close(f.ownerIncome + f.commission.amount + f.emeraude.cleaningNet, f.netPayout);
});

test('C2. Le taux est celui saisi, sans plancher ni valeur imposée ; un champ vide est refusé', () => {
  for (const pct of [0, 12.5, 15, 17.5, 20, 25, 50]) {
    const f = computeFinancials(NIGHTS, { cleaningFee: 50, commissionPct: pct }, 5, CFG);
    close(f.commission.rate, pct / 100);
    close(f.commission.amount, 929.5 * pct / 100);
  }
  const autre = structuredClone(CFG);
  autre.defaults.commissionPct = 33;
  close(estimate(baseRaw({ commissionPct: '15' }), ctx({ config: autre })).scenarios.realiste.commission.rate, 0.15);
  for (const v of ['', undefined, 'abc']) assert.equal(estimate(baseRaw({ commissionPct: v }), ctx()).ok, false);
  assert.equal(CFG.commission.defaultRate, undefined);
});

test('C3. L\'ancienne répartition du ménage ne peut plus être réactivée', () => {
  const ancienne = structuredClone(CFG);
  ancienne.fees.cleaningFeeShareBearer = 'emeraude';
  const f = computeFinancials(NIGHTS, { cleaningFee: 50, commissionPct: 18 }, 5, ancienne);
  close(f.ownerIncome, 662.19);
  close(f.emeraude.cleaningNet, 100);
  assert.ok(validateSchema(ancienne, J('schemas/config.schema.json')).length > 0);
  assert.deepEqual(validateSchema(CFG, J('schemas/config.schema.json')), []);
  assert.equal(CFG.commission.base, 'payout_net_of_host_fee');
  assert.equal(CFG.fees.vat, undefined);
});

test('C4. Revenu propriétaire négatif : la fourchette reste ordonnée', () => {
  const r = buildRange(-1000, 10, 100);
  assert.ok(r.low < r.central && r.central < r.high);
  const s = estimate(baseRaw({ commissionPct: '50', cleaningFee: '500', avgStay: '1' }), ctx()).summary.owner;
  assert.ok(s.central < 0 && s.low <= s.central && s.central <= s.high);
});

test('C5. dist/config.json, lu en ligne par la préversion, reprend exactement la configuration source', () => {
  const b = J('dist/config.json');
  assert.deepEqual(b.config, CFG);
  assert.deepEqual(b.communes, J('config/communes.json'));
  assert.deepEqual(b.sources, J('config/sources.json'));
});

test('C6. Une configuration en ligne ou en cache aux anciennes règles est refusée', () => {
  const src = /function validBundle\(b\)\{.*\}/.exec(read('embed/template.html'))[0];
  const sandbox = {};
  vm.runInNewContext(`${src};this.validBundle=validBundle;`, sandbox);
  const bundle = (config) => ({ schemaVersion: 1, config, communes: {}, sources: {} });
  assert.equal(sandbox.validBundle(bundle(CFG)), true);
  const ancienne = structuredClone(CFG);
  ancienne.commission.base = 'nights_net_of_host_fee';
  assert.equal(sandbox.validBundle(bundle(ancienne)), false);
});

test('C7. Pages générées : plus aucune référence à l\'ancienne TVA ni à l\'ancienne règle', () => {
  const interdit = /fees\.vat|vatLabel|vatHint|vatMetric|vatAmount|vatEnabled|vatOn|\$\('vat'\)|id="vat"|"vat":|15,5 % HT|nights_net_of_host_fee|nights_gross|"cleaningFeeShareBearer":"emeraude"|charge d.Émeraude|Revenu net après Airbnb|defaultRate/;
  for (const f of [...GENERATED, 'dist/config.json', 'embed/template.html', 'engine/core.js', 'engine/inputs.js', 'engine/index.js', 'scripts/build-artifact.mjs']) {
    assert.equal(interdit.exec(read(f))?.[0], undefined, f);
    assert.equal(/\bTVA\b/.exec(read(f).split(CFG.texts.disclaimer).join('').split(JSON.stringify(CFG.texts.disclaimer).slice(1, -1)).join(''))?.[0], undefined, f); // seule mention admise : l'avertissement validé
  }
});

test('C8. Chaque élément appelé par la page existe', () => {
  for (const f of GENERATED) {
    const h = read(f);
    const script = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    const ids = new Set([...h.matchAll(/\bid=\\?["']([\w-]+)\\?["']/g)].map((m) => m[1]));
    const previewOnly = new Set(['legacyCmp', 'simSelect', 'dateInput']); // appels protégés par IS_PREVIEW
    const missing = [...new Set([...script.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]))].filter((id) => !ids.has(id) && !previewOnly.has(id));
    assert.deepEqual(missing, [], f);
  }
});

test('C9. Interface, rapport imprimable, e-mail et pages générées énoncent les mêmes règles', () => {
  const t = read('embed/template.html');
  const section = (debut, fin) => { const a = t.indexOf(debut); assert.ok(a >= 0, debut); const b = t.indexOf(fin, a); assert.ok(b > a, fin); return t.slice(a, b); };
  const interfaceBloc = section('<div class="quick">', '<div class="metric wide">');
  const attendu = {
    interface: [interfaceBloc, ['Base de commission (nuits + ménage nets)', 'Frais Airbnb sur le ménage (charge propriétaire)', 'Ménage brut revenant à Émeraude']],
    methode: [section('function methodHtml', 'function presentBoxes'), ['Base de commission : nuits nettes + ménage net', 'Frais Airbnb sur le ménage (à la charge du propriétaire)', 'Ménage brut revenant à Émeraude']],
    rapport: [section('function presentBoxes', 'return b;'), ['Base de commission (nuits + ménage nets)', 'Frais Airbnb sur le ménage (charge propriétaire)', 'Ménage brut revenant à Émeraude', 'taux indicatif']],
    piedDeRapport: [section("$('pFoot').textContent", '\n'), ['leur montant brut revient à Émeraude', 'réduisent le revenu propriétaire', 'négocié avec chaque propriétaire']],
    email: [section('function buildEmail', 'Bien cordialement'), ['Base de commission (nuits + ménage nets des frais Airbnb)', 'restent à la charge du propriétaire', 'le ménage brut revient à Émeraude', 'taux indicatif', 'négocié pour chaque propriétaire']]
  };
  for (const [nom, [texte, phrases]] of Object.entries(attendu)) for (const x of phrases) assert.ok(texte.includes(x), `${nom} : ${x}`);
  assert.ok(t.includes('Valeur indicative modifiable : le taux est négocié avec chaque propriétaire'));
  for (const f of GENERATED) assert.ok(read(f).includes(interfaceBloc), f);
});

test('C10. TVA : aucune TVA calculée dans la simulation et avertissement sans ambiguïté', () => {
  const f = computeFinancials(NIGHTS, { cleaningFee: 50, commissionPct: 20 }, 5, CFG);
  close(f.airbnb.onNights + f.airbnb.onCleaning, 1100 * 0.155);
  close(f.commission.amount, 1100 * 0.845 * 0.2);
  close(f.ownerIncome + f.commission.amount + f.emeraude.cleaningNet + f.airbnb.onNights + f.airbnb.onCleaning, 1100);
  const t = CFG.texts.disclaimer;
  assert.ok(!t.includes('TVA incluse le cas échéant'));
  assert.ok(t.includes("Le taux de 15,5 % correspond aux frais de service Airbnb, à titre indicatif et TVA comprise lorsqu'elle est applicable. Aucune TVA supplémentaire n'est ajoutée à ce taux."));
  assert.ok(t.includes("Pour les besoins de cette simulation, les revenus issus de la location meublée classique (LMNP/LMP) sont considérés comme exonérés de TVA. La commission de conciergerie est calculée selon le taux convenu avec le propriétaire, sans ajout automatique de TVA. Le traitement fiscal réel dépend de la situation de chaque partie."));
});

test('C11. L\'avertissement garde ses paragraphes à l\'écran et à l\'impression', () => {
  assert.ok(CFG.texts.disclaimer.includes('\n\n'));
  for (const f of ['embed/template.html', ...GENERATED]) assert.ok(read(f).includes('#emeraude-estimateur #note,#emeraude-estimateur .present-foot{white-space:pre-line}'), f);
});

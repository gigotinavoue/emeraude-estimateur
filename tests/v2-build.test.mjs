// Tests de préparation de la V2 (/estimateur-v2) : rien n'est publié ; on vérifie les fichiers générés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { buildEmbed } from '../scripts/build-embed.mjs';
import { estimate, ENGINE_VERSION } from '../engine/index.js';
import { ROOT, J, ctx, baseRaw } from './helpers.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
buildEmbed();

test('V1. La sauvegarde de l\'Embed de production est intacte (empreinte SHA-256 identique)', () => {
  const meta = J('legacy/embed-v1-meta.json');
  const html = read('legacy/embed-v1-backup.html');
  assert.equal(crypto.createHash('sha256').update(html).digest('hex'), meta.sha256);
});

test('V2. Version de validation : noindex et badge présents ; version finale : ni noindex ni badge', () => {
  const val = read('deploy/estimateur-v2/estimateur-v2-validation.html');
  const fin = read('embed/estimateur-v2.html');
  assert.ok(val.includes('noindex, nofollow') && val.includes('VERSION DE VALIDATION'));
  assert.ok(!fin.includes('noindex') && !fin.includes('VERSION DE VALIDATION'));
  for (const h of [val, fin]) assert.ok(!/%%[A-Z_0-9]+%%/.test(h), 'balise de gabarit non remplacée');
});

test('V3. Les scripts générés sont valides et embarquent le moteur ' + ENGINE_VERSION, () => {
  for (const f of ['deploy/estimateur-v2/estimateur-v2-validation.html', 'embed/estimateur-v2.html']) {
    const h = read(f);
    const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s), f);
    assert.ok(h.includes(`ENGINE_VERSION = '${ENGINE_VERSION}'`), f);
  }
});

test('V4. Le moteur embarqué dans la page donne exactement le même résultat que le moteur de référence', () => {
  const h = read('embed/estimateur-v2.html');
  const engineScript = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('window.EmeraudeEngine='));
  const sandbox = { window: {}, Intl, Math, Date, JSON, Number, String, Array, Object, Set, Map, isFinite };
  vm.runInNewContext(engineScript, sandbox);
  const c = ctx({ today: new Date('2026-10-04T12:00:00Z') });
  for (const over of [{}, { commune: 'saint-malo', type: 't4', bedrooms: '3', area: '80', guests: '6' }, { commune: 'liffre', guests: '5' }]) {
    const a = estimate(baseRaw(over), c);
    const b = sandbox.window.EmeraudeEngine.estimate(baseRaw(over), c);
    assert.equal(JSON.stringify(b.summary), JSON.stringify(a.summary));
    assert.equal(b.scenarios.realiste.nightsRevenue, a.scenarios.realiste.nightsRevenue);
  }
});

test('V5. Les pages générées affichent l\'avertissement « non une garantie » et distinguent scénarios et fourchette', () => {
  const h = read('embed/estimateur-v2.html');
  assert.ok(h.includes('id="rangeNote"') && h.includes('id="confReasons"') && h.includes('id="uncRange"'));
  assert.ok(J('config/config.json').uncertainty.texts.rangeNote.includes('non une garantie'));
});

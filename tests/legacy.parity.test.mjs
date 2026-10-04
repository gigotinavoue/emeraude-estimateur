// Vérifie que legacy/legacy-engine.js reproduit EXACTEMENT le script de l'Embed v1 sauvegardé,
// en exécutant le script d'origine dans un DOM simulé minimal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { legacyCalculate } from '../legacy/legacy-engine.js';
import { ROOT, J, toLegacy } from './helpers.mjs';

const html = fs.readFileSync(path.join(ROOT, 'legacy/embed-v1-backup.html'), 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

function runOriginal(i) {
  const els = {};
  const el = (id) => (els[id] ??= { id, value: '', textContent: '', style: {}, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, removeAttribute() {}, focus() {}, click() {} });
  const set = { city: i.city, type: i.type, bed: i.bed, bath: i.bath, area: i.area, guest: i.guest, months: i.months, loc: i.loc, commission: i.commission, cleaningFee: i.cleaningFee, stayLength: i.stayLength };
  for (const [k, v] of Object.entries(set)) el(k).value = String(v);
  const checks = Array.from({ length: 32 }, (_, n) => ({ dataset: { i: String(n) }, checked: i.eq.includes(n), addEventListener() {}, removeAttribute() {} }));
  const root = { querySelector: (sel) => el(sel.replace('#', '')), querySelectorAll: () => checks };
  const document = { getElementById: (id) => (id === 'emeraude-estimateur' ? root : null) };
  const window = { open: () => ({}), location: {}, scrollTo() {}, print() {} };
  new Function('document', 'window', 'setTimeout', script)(document, window, () => {});
  return els;
}

const euros = (s) => Number(String(s).replace(/[^\d-]/g, ''));

test('L1. Parité exacte ancien Embed / legacy-engine sur tous les logements de test', () => {
  const fx = J('tests/fixtures/properties.json');
  const config = J('config/config.json');
  const communes = J('config/communes.json');
  for (const prop of fx.properties) {
    const li = toLegacy(prop, fx.defaults, config, communes);
    const o = runOriginal(li);
    const r = legacyCalculate(li);
    const fmt = (n) => Math.round(n);
    assert.equal(euros(o.adr.textContent), fmt(r.adr), `${prop.id} adr`);
    assert.equal(o.occ.textContent, Math.round(r.occ * 100) + '%', `${prop.id} occ`);
    for (const [id, val] of [['annual', r.annual], ['monthly', r.monthly], ['airbnb', r.airbnb], ['netAfterAirbnb', r.netAfterAirbnb], ['concierge', r.concierge], ['cleaningCollected', r.cleaningCollected], ['owner', r.owner], ['lowCA', r.low.ca], ['midCA', r.mid.ca], ['highCA', r.high.ca]]) {
      assert.ok(Math.abs(euros(o[id].textContent) - fmt(val)) <= 1, `${prop.id} ${id} : embed ${o[id].textContent} vs réplique ${fmt(val)}`);
    }
  }
});

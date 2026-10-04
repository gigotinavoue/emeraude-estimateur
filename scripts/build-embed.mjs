// Génère, à partir de embed/template.html et du moteur :
//  - embed/estimateur-v2.html        : HTML à coller dans l'Embed Framer (impression et e-mail réels) ;
//  - dist/preview.html               : préversion de test autonome (GitHub Pages), avec panneau de simulation ;
//  - reports/preview-artifact.html   : même préversion, au format fragment (page de test privée).
// Les données de secours (config + marché) sont intégrées au moment de la génération.
import fs from 'node:fs';
import { readJson, writeText, p } from './lib/util.mjs';

const ENGINE_ORDER = ['safe.js', 'inputs.js', 'quality.js', 'resolveMarket.js', 'adjustments.js', 'core.js', 'uncertainty.js', 'index.js'];

export function bundleModules(dir, files, exportsLine) {
  const parts = files.map((f) => {
    const src = fs.readFileSync(p(dir, f), 'utf8');
    return `// ---- ${dir}/${f} ----\n` + src
      .split('\n')
      .filter((l) => !/^\s*import\s.+from\s+['"].+['"];?\s*$/.test(l))
      .map((l) => l.replace(/^export\s+(function|const|let|class)\s/, '$1 '))
      .join('\n');
  });
  return `(function(){\n'use strict';\n${parts.join('\n')}\n${exportsLine}\n})();`;
}

const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
const safeJson = (x) => JSON.stringify(x).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');

const TESTBAR = `<div class="testbar"><div class="testbar-inner"><b>Préversion de test — hors Framer</b>
<div class="testbar-row">
<div class="field"><label for="simSelect">Simuler une situation de données</label><select id="simSelect">
<option value="none">Normal : données publiées avec cette page</option>
<option value="offline">Données en ligne indisponibles</option>
<option value="corrupt">Fichier en ligne corrompu</option>
<option value="stale">Données anciennes (année 2021)</option>
<option value="outlier">Valeur aberrante (Rennes Métropole à 900 €/nuit)</option>
<option value="noepci">Intercommunalité sans donnée (Vitré Communauté)</option>
<option value="noseason">Profils saisonniers absents</option>
</select></div>
<div class="field"><label for="dateInput">Date du jour simulée (fraîcheur)</label><input id="dateInput" type="date"></div>
</div>
<div class="legacy-cmp" id="legacyCmp"></div>
</div></div>`;

export function buildEmbed({ marketUrl = '', configUrl = '' } = {}) {
  const config = readJson('config/config.json');
  const communes = readJson('config/communes.json');
  const sources = readJson('config/sources.json');
  const market = readJson('dist/market.json');
  const template = fs.readFileSync(p('embed/template.html'), 'utf8');
  const engine = bundleModules('engine', ENGINE_ORDER, 'window.EmeraudeEngine={estimate:estimate,ENGINE_VERSION:ENGINE_VERSION};');
  const engineVersion = /ENGINE_VERSION = '([^']+)'/.exec(fs.readFileSync(p('engine/index.js'), 'utf8'))[1];
  const legacy = `<script>\n/* Ancien moteur (comparaison, préversion uniquement) */\n${bundleModules('legacy', ['legacy-engine.js'], 'window.EmeraudeLegacy={legacyCalculate:legacyCalculate};')}\n</script>`;
  const builtAt = new Date().toISOString();
  const snapshot = { builtAt, config, communes, sources, market };

  const fill = (t, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`%%${k}%%`).join(v), t);
  const common = { ENGINE: engine, SNAPSHOT: safeJson(snapshot), ENGINE_VERSION: engineVersion, BUILT_AT: builtAt.slice(0, 10) };

  const V2_BADGE = '<div class="v2-badge">V2 · VERSION DE VALIDATION</div>';
  // Garde-fou supplémentaire pour la page /estimateur-v2 : ajoute <meta name="robots" content="noindex, nofollow">
  // (le réglage « noindex » de la page Framer reste la protection principale, voir deploy/estimateur-v2/CHECKLIST.md).
  const NOINDEX = '<script>(function(){try{var m=document.querySelector(\'meta[name="robots"]\');if(!m){m=document.createElement("meta");m.setAttribute("name","robots");document.head.appendChild(m);}m.setAttribute("content","noindex, nofollow");}catch(e){}})();</script>\n';
  const embed = fill(template, { ...common, TESTBAR: '', LEGACY_SCRIPT: '', IS_PREVIEW: 'false', MARKET_URL: marketUrl, CONFIG_URL: configUrl, V2_BADGE: '' });
  const validationEmbed = NOINDEX + fill(template, { ...common, TESTBAR: '', LEGACY_SCRIPT: '', IS_PREVIEW: 'false', MARKET_URL: marketUrl, CONFIG_URL: configUrl, V2_BADGE });
  const previewFragment = fill(template, { ...common, TESTBAR, LEGACY_SCRIPT: legacy, IS_PREVIEW: 'true', MARKET_URL: './market.json', CONFIG_URL: './config.json', V2_BADGE });
  const title = '<title>Estimateur Émeraude V2</title>\n';
  const previewDoc = `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}<meta name="robots" content="noindex">\n</head>\n<body style="margin:0">\n${previewFragment}\n</body>\n</html>\n`;

  writeText('embed/estimateur-v2.html', embed);
  writeText('deploy/estimateur-v2/estimateur-v2-validation.html', validationEmbed);
  writeText('dist/preview.html', previewDoc);
  writeText('reports/preview-artifact.html', title + previewFragment);
  return { embedBytes: Buffer.byteLength(embed), previewBytes: Buffer.byteLength(previewDoc), builtAt };
}

if (process.argv[1].endsWith('build-embed.mjs')) {
  const base = process.env.ESTIMATEUR_DATA_BASE_URL || '';
  const r = buildEmbed({ marketUrl: base ? `${base.replace(/\/$/, '')}/market.json` : '', configUrl: base ? `${base.replace(/\/$/, '')}/config.json` : '' });
  console.log(`embed/estimateur-v2.html : ${(r.embedBytes / 1024).toFixed(0)} Ko ; dist/preview.html : ${(r.previewBytes / 1024).toFixed(0)} Ko.`);
  if (!base) console.log('Note : ESTIMATEUR_DATA_BASE_URL non défini — l\'Embed utilisera ses données de secours intégrées jusqu\'à la configuration de GitHub Pages.');
}

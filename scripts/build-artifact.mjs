// Génère l'artifact Claude officiel de l'estimateur : dist/estimateur-artifact.html
// (fragment HTML autonome, publié sur claude.ai ; l'ancien estimateur Framer est abandonné).
//
// Source de vérité : l'état VALIDÉ du dépôt. Rien n'est recalculé ni modifié ici :
//  - moteur : engine/*.js, regroupé exactement comme par scripts/build-embed.mjs ;
//  - interface : embed/template.html (mêmes champs, même logique), avec des ajustements limités à ce que le cadre
//    d'un artifact impose (pas d'impression ni d'ouverture de fenêtre, pas de récupération en ligne) ;
//  - données : config/*.json, dist/market.json, dist/data-status.json, data/history/reference-accepted.json.
//
// Différence voulue avec l'Embed : l'artifact ne récupère aucune donnée en ligne. La version validée qu'il embarque
// est transmise au moteur comme donnée de référence (origine « remote »), et non comme « données de secours »
// (décision de l'utilisateur, 2026-10-05). Les résultats sont donc identiques aux références validées.
//
// Garde-fous : chaque ajustement du gabarit doit trouver son point d'ancrage exactement une fois, et les logements
// de référence doivent être reproduits à l'identique par le moteur embarqué ; sinon la génération échoue.
//
// Génération stable : le fichier n'est réécrit que si son contenu change (builtAt = date du dernier vrai changement).
// Appelé automatiquement par scripts/refresh.mjs lorsqu'une nouvelle version est reconstruite ; la PUBLICATION sur
// claude.ai reste manuelle (aucune API de publication accessible depuis GitHub Actions).
// Dates : stockées en UTC, affichées en heure de Paris (Europe/Paris), quel que soit le fuseau de l'appareil.
import fs from 'node:fs';
import vm from 'node:vm';
import { readJson, stableBuild, p } from './lib/util.mjs';
import { bundleModules } from './build-embed.mjs';
import { RANGE_CASES, raw as referenceRaw } from './audit/final-review.mjs';

export const ARTIFACT = {
  name: 'Estimateur Émeraude — V2 Data Refresh',
  title: 'Estimateur Émeraude V2 Data Refresh',
  version: '2.1.0',
  output: 'dist/estimateur-artifact.html'
};

const ENGINE_ORDER = ['safe.js', 'inputs.js', 'quality.js', 'resolveMarket.js', 'adjustments.js', 'core.js', 'uncertainty.js', 'index.js'];
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
const safeJson = (x) => JSON.stringify(x).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');

// Remplacement exact, unique et vérifié.
function replaceOnce(text, find, repl, label) {
  const n = text.split(find).length - 1;
  if (n !== 1) throw new Error(`Gabarit : point d'ancrage « ${label} » trouvé ${n} fois (1 attendu). Génération interrompue.`);
  return text.replace(find, () => repl);
}
// Remplace le bloc compris entre deux marqueurs (le marqueur de fin est conservé).
function replaceBlock(text, start, end, repl, label) {
  const i = text.indexOf(start);
  const j = i < 0 ? -1 : text.indexOf(end, i);
  if (i < 0 || j < 0 || text.indexOf(start, i + 1) >= 0) throw new Error(`Gabarit : bloc « ${label} » introuvable ou ambigu. Génération interrompue.`);
  return text.slice(0, i) + repl + text.slice(j);
}

// Reproduit les logements de référence avec un moteur donné ; mêmes champs que scripts/audit/reference-properties.mjs.
export function checkReferences(estimate, snap) {
  const ref = snap.referenceAccepted;
  const today = new Date(`${ref.computedFor}T12:00:00Z`);
  const ctx = { config: snap.config, communes: snap.communes, sources: snap.sources, marketSources: [{ origin: 'remote', data: snap.market }], today };
  return snap.referenceCases.map(([label, over]) => {
    const exp = ref.properties.find((x) => x.label === label);
    const r = estimate({ ...snap.referenceBase, ...over }, ctx);
    if (!exp || !r.ok) return { label, ok: false, diff: [!exp ? 'référence absente' : 'calcul impossible'] };
    const s = r.scenarios.realiste;
    const got = { marketKey: r.data.marketKey, adr: Math.round(s.adrAnnual * 100) / 100, occupancyPct: Math.round(s.occupancyAnnual * 1000) / 10, nightsRevenue: Math.round(s.nightsRevenue), central: r.summary.central, low: r.summary.low, high: r.summary.high, uncertaintyPct: r.summary.uncertaintyPct, confidence: r.summary.confidence, freshnessMonths: r.data.freshness.months };
    const diff = Object.keys(got).filter((k) => got[k] !== exp[k]);
    return { label, ok: diff.length === 0, diff, got };
  });
}

const CSS = `/* Artifact V2 Data Refresh : données embarquées, classes de données, version */
#emeraude-estimateur .ver-badge{background:var(--g);color:#fff;font-size:11px;font-weight:800;padding:7px 10px;border-radius:999px;white-space:nowrap}
#emeraude-estimateur #integrityBanner{margin-bottom:12px}
#emeraude-estimateur .dc{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.05em;padding:2px 6px;border-radius:6px;white-space:nowrap;vertical-align:1px}
#emeraude-estimateur .dc-obs{background:var(--ok2);color:var(--ok)}
#emeraude-estimateur .dc-proxy{background:var(--warn2);color:var(--warn)}
#emeraude-estimateur .dc-cal{background:var(--g2);color:var(--g)}
#emeraude-estimateur .dc-hyp{background:#efeae0;color:#5f5233}
#emeraude-estimateur .dc-fb{background:var(--bad2);color:var(--bad)}
#emeraude-estimateur .dr-panel{margin-top:18px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
#emeraude-estimateur .dr-panel>*{min-width:0}
#emeraude-estimateur .dr-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
#emeraude-estimateur .dr-summary .metric strong{font-size:15px}
#emeraude-estimateur .metric strong span{display:inline-block;margin:0}
#emeraude-estimateur .dr-sub{font-size:13px;font-weight:800;margin:4px 0 0}
#emeraude-estimateur .dr-scroll{overflow-x:auto}
#emeraude-estimateur .dr-table{width:100%;border-collapse:collapse;font-size:12px;min-width:620px}
#emeraude-estimateur .dr-table th,#emeraude-estimateur .dr-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
#emeraude-estimateur .dr-table th{font-size:11px;color:var(--muted);font-weight:700}
#emeraude-estimateur .dr-table td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
#emeraude-estimateur .dr-table tr.fam td{background:var(--bg);font-weight:800}
#emeraude-estimateur .dr-note{font-size:11px;color:var(--muted);line-height:1.5;margin:0}
#emeraude-estimateur .dr-foot{margin-top:14px;font-size:11px;color:var(--muted);line-height:1.6;display:flex;flex-wrap:wrap;gap:4px 14px}
#emeraude-estimateur .dr-foot b{color:var(--ink);font-weight:700}
#emeraude-estimateur .dr-foot .ok{color:var(--ok);font-weight:700}
#emeraude-estimateur .dr-foot .ko{color:var(--bad);font-weight:700}
#emeraude-estimateur .mail-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
#emeraude-estimateur .mail-links a{color:var(--g);font-weight:750}
`;

const DATA_PANEL = `
<section class="card dr-panel" id="dataPanel" aria-labelledby="drTitle">
<div class="section" id="drTitle">Données embarquées dans cet estimateur<small id="drIntro">—</small></div>
<div class="dr-summary" id="drSummary"></div>
<div class="banner" id="drStale" hidden></div>
<div><div class="dr-sub">Fraîcheur par famille de données</div><p class="dr-note" id="drRule">—</p></div>
<div class="dr-scroll"><table class="dr-table" id="drFamilies"></table></div>
<div><div class="dr-sub">Nature des éléments du calcul</div><p class="dr-note">OBSERVÉE : statistique publiée par la source. PROXY : série d’un autre périmètre utilisée comme approximation. CALIBRATION : ratios issus d’autres villes. HYPOTHÈSE : règle ou coefficient du modèle Émeraude. FALLBACK : repli signalé, qui abaisse la confiance.</p></div>
<div class="dr-scroll"><table class="dr-table" id="drClasses"></table></div>
<div><div class="dr-sub">Sources</div></div>
<div class="dr-scroll"><table class="dr-table" id="drSources"></table></div>
</section>
<footer class="dr-foot" id="drFoot"></footer>
`;

const EXTRAS_JS = `
/* ---------- Artifact V2 Data Refresh : données embarquées, fraîcheur, intégrité ---------- */
const DC_CLASS={'OBSERVÉE':'dc-obs','PROXY':'dc-proxy','CALIBRATION':'dc-cal','HYPOTHÈSE':'dc-hyp','FALLBACK':'dc-fb'};
function dcTag(c){return '<span class="dc '+(DC_CLASS[c]||'dc-hyp')+'">'+esc(c)+'</span>';}
const STATUS_FR={HIGH:'Élevée',MEDIUM:'Moyenne',LOW:'Faible'};
function statusPill(s){return '<span class="pill '+confClass(s)+'">'+esc(STATUS_FR[s]||s)+'</span>';}
function monthYear(s){if(!s)return '—';const m=String(s).match(/^(\\d{4})-(\\d{2})/);if(!m)return esc(s);return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(Date.UTC(+m[1],+m[2]-1,15)));}
/* Dates : stockées en UTC ; une date seule (AAAA-MM-JJ) est un jour calendaire, un horodatage est affiché en heure de Paris. */
function dayDate(s){if(!s)return '—';return String(s).length===10?fmtDate(s+'T12:00:00Z'):fmtDateTime(s);}
let integrity={ok:0,total:0,bad:[]};

function runIntegrityCheck(){
const ref=SNAPSHOT.referenceAccepted,cases=SNAPSHOT.referenceCases||[];
const t=new Date(ref.computedFor+'T12:00:00Z');
const ctx={config:SNAPSHOT.config,communes:SNAPSHOT.communes,sources:SNAPSHOT.sources,marketSources:[{origin:'remote',data:SNAPSHOT.market}],today:t};
integrity={ok:0,total:cases.length,bad:[]};
for(const [label,over] of cases){
const exp=ref.properties.find(x=>x.label===label);
let r;try{r=Engine.estimate(Object.assign({},SNAPSHOT.referenceBase,over),ctx);}catch(e){r={ok:false};}
if(!exp||!r.ok){integrity.bad.push(label);continue;}
const s=r.scenarios.realiste;
const got={marketKey:r.data.marketKey,adr:Math.round(s.adrAnnual*100)/100,occupancyPct:Math.round(s.occupancyAnnual*1000)/10,nightsRevenue:Math.round(s.nightsRevenue),central:r.summary.central,low:r.summary.low,high:r.summary.high,uncertaintyPct:r.summary.uncertaintyPct,confidence:r.summary.confidence,freshnessMonths:r.data.freshness.months};
const diff=Object.keys(got).filter(k=>got[k]!==exp[k]);
if(diff.length)integrity.bad.push(label+' ('+diff.join(', ')+')');else integrity.ok++;
}
const b=$('integrityBanner');
if(integrity.bad.length||!integrity.total){b.hidden=false;b.innerHTML='<b>Contrôle d’intégrité échoué : ne pas utiliser cet estimateur.</b> Les logements de référence ne sont plus reproduits à l’identique : '+esc(integrity.bad.join(' ; '))+'.';}
renderFoot();
}

function renderFoot(){
const A=SNAPSHOT.artifact,ds=SNAPSHOT.dataStatus;
const ic=integrity.total&&!integrity.bad.length?'<span class="ok">'+integrity.ok+'/'+integrity.total+' logements de référence reproduits à l’identique</span>':'<span class="ko">'+integrity.ok+'/'+integrity.total+' logements de référence reproduits</span>';
$('drFoot').innerHTML='<span><b>'+esc(A.name)+'</b></span><span>Version '+esc(A.version)+'</span><span>Moteur '+esc(Engine.ENGINE_VERSION)+'</span><span>Configuration '+esc(SNAPSHOT.config.version)+'</span><span>Marché : année '+esc(ds.marketDataYear)+' (version validée du '+esc(fmtDateTime(SNAPSHOT.market.generatedAt))+')</span><span>Généré le '+esc(fmtDateTime(SNAPSHOT.builtAt))+'</span><span>Contrôle à l’ouverture : '+ic+'</span><span>Heures affichées en heure de Paris</span>';
}

function sourceLabel(id){const s=(SNAPSHOT.sources.sources||{})[id];return s?s.label:id;}

function renderDataPanel(){
const ds=SNAPSHOT.dataStatus,mk=SNAPSHOT.market;
$('drIntro').textContent='Dernière version validée du dépôt emeraude-estimateur. Cet outil ne récupère aucune donnée en ligne : les données publiques sont actualisées et contrôlées par GitHub Actions, puis l’estimateur est resynchronisé avec la version validée.';
const fam=ds.families.find(f=>f.id==='market')||{items:[]};
const it=fam.items[0]||{};
const tiles=[
['Données de marché',(ds.marketDataYear?'Année '+esc(ds.marketDataYear):'—')+' '+dcTag('OBSERVÉE')],
['Période couverte',it.periodEnd?'1<sup>er</sup> janv. – 31 déc. '+esc(it.periodEnd.slice(0,4)):'—'],
['Publication par la source',monthYear((mk.markets&&mk.markets[it.key]&&mk.markets[it.key].publishedAt)||'')],
['Âge des données','<span id="drAge">—</span>'],
['Confiance des données',statusPill(ds.globalDataConfidence)],
['Dernière récupération',esc(dayDate(it.retrievedAt))],
['Version validée du',esc(fmtDateTime(mk.generatedAt))],
['Dernier contrôle de fraîcheur',esc(fmtDateTime(ds.checkedAt))]
];
$('drSummary').innerHTML=tiles.map(([k,v])=>'<div class="metric"><span>'+esc(k)+'</span><strong>'+v+'</strong></div>').join('');
const asOf=ds.freshnessAsOf||ds.checkedAt;
$('drRule').textContent='Seuils : élevée '+ds.thresholds.HIGH+' · moyenne '+ds.thresholds.MEDIUM+' · faible '+ds.thresholds.LOW+', depuis la fin de la période couverte. '+ds.globalRule+' Âges ci-dessous calculés à la date du '+fmtDate(asOf)+' (contrôle effectué le '+fmtDateTime(ds.checkedAt)+') ; l’âge affiché pour chaque estimation est recalculé au jour de l’estimation.';
let h='<thead><tr><th>Élément</th><th>Nature</th><th>Fin de période</th><th>Âge</th><th>Fraîcheur</th><th>Récupéré le</th><th>Source</th></tr></thead><tbody>';
for(const f of ds.families){
h+='<tr class="fam"><td colspan="4">'+esc(f.label)+' · '+(f.role==='calcul'?'utilisé dans le calcul':'contrôle uniquement')+'</td><td>'+statusPill(f.status)+'</td><td colspan="2"></td></tr>';
for(const x of f.items){h+='<tr><td>'+esc(x.label)+'</td><td>'+dcTag(x.dataClass)+'</td><td class="num">'+esc(dayDate(x.periodEnd))+'</td><td class="num">'+esc(x.freshnessMonths)+' mois</td><td>'+statusPill(x.status)+'</td><td class="num">'+esc(dayDate(x.retrievedAt))+'</td><td>'+esc(sourceLabel(x.source))+'</td></tr>';}
}
$('drFamilies').innerHTML=h+'</tbody>';
$('drClasses').innerHTML='<thead><tr><th>Élément</th><th>Nature</th><th>Précision</th></tr></thead><tbody>'+ds.classification.map(c=>'<tr><td>'+esc(c.item)+'</td><td>'+dcTag(c.dataClass)+'</td><td>'+esc(c.note)+'</td></tr>').join('')+'</tbody>';
const used=['adt35_lighthouse','insee_hotels','eurostat_platforms','adt35_chiffres_cles','audiar_observatoire','inside_airbnb_structure'];
$('drSources').innerHTML='<thead><tr><th>Source</th><th>Usage</th><th>Licence</th></tr></thead><tbody>'+used.filter(id=>SNAPSHOT.sources.sources[id]).map(id=>{const s=SNAPSHOT.sources.sources[id];return '<tr><td>'+esc(s.label)+'</td><td>'+esc(s.usage||'')+'</td><td>'+esc(s.licence||'')+'</td></tr>';}).join('')+'</tbody>';
}

function renderArtifactExtras(r){
const s=r.scenarios.realiste,d=r.data;
const meta=((SNAPSHOT.market.markets||{})[d.marketKey]||{}).meta||{};
const own=d.geoRole==='epci'||d.geoRole==='commune';
$('mClass').innerHTML=own?dcTag(meta.dataClass||'OBSERVÉE')+' moyenne de l’intercommunalité, appliquée à la commune':dcTag('FALLBACK')+(d.geoRole==='epci_voisin'?' marché voisin':' données départementales');
$('mRetrieved').textContent=meta.retrievedAt?dayDate(meta.retrievedAt):'non précisée';
$('mUpdated').textContent=d.marketGeneratedAt?fmtDateTime(d.marketGeneratedAt):'non précisée';
$('mSeasonClass').innerHTML=dcTag(d.seasonality.fallback?'FALLBACK':'PROXY')+' profils départementaux, non locaux';
const tiles=[['Nuits réservées (période)',num(s.nightsBooked)],['Mois disponibles',num(s.monthsCount)+' mois · '+num(s.nightsAvailable)+' nuits'],['Séjours estimés × ménage',num(s.cleaning.stays)+' × '+euro(s.cleaning.feePerStay)],['Frais Airbnb sur le ménage (Émeraude)',e10(s.cleaning.hostFee)]];
$('drMetrics').innerHTML=tiles.map(([k,v])=>'<div class="metric"><span>'+esc(k)+'</span><strong>'+v+'</strong></div>').join('');
const age=$('drAge');if(age)age.innerHTML=esc(d.freshness.months)+' mois · <span class="pill '+freshClass(d.freshness.level)+'">'+esc(d.freshness.label)+'</span>';
const st=$('drStale');
if(d.freshness.level!=='green'){st.hidden=false;st.className='banner'+(d.freshness.level==='red'?' bad':'');st.textContent='Les données de marché embarquées portent sur l’année '+(d.period&&d.period.end?d.period.end.slice(0,4):'?')+' et ont '+d.freshness.months+' mois. Ce sont les plus récentes intégrées à la version validée du '+fmtDateTime(SNAPSHOT.market.generatedAt)+'. L’estimateur sera resynchronisé dès qu’une version plus récente aura été validée.';}
else st.hidden=true;
}
`;

const OPEN_EMAIL = `function openEmailModal(){
if(!last){return;}
$('mailStatus').textContent='';
const m=buildEmail(last);
$('emailPreview').value='Objet : '+m.subject+'\\n\\n'+m.body;
$('emailPreviewWrap').hidden=false;$('copyEmail').hidden=false;
$('emailIntro').textContent='Vérifiez le texte préparé. Copiez-le dans votre messagerie, ou indiquez l’adresse du propriétaire pour ouvrir un brouillon Gmail prérempli.';
$('emailModal').classList.add('open');
setTimeout(()=>$('ownerEmail').focus(),50);
}
`;

const PREPARE_EMAIL = `function prepareOwnerEmail(){
const email=$('ownerEmail').value.trim();
if(!email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){$('mailStatus').textContent='Merci d’indiquer une adresse e-mail valide.';return;}
if(!last){$('mailStatus').textContent='Aucune estimation à envoyer.';return;}
const m=buildEmail(last);
const gmail='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+encodeURIComponent(m.subject)+'&body='+encodeURIComponent(m.body);
$('mailStatus').innerHTML='Brouillon prêt pour '+esc(email)+'. Rien n’est envoyé automatiquement : vérifiez le message puis envoyez-le depuis votre messagerie.<div class="mail-links"><a href="'+esc(gmail)+'" target="_blank" rel="noopener noreferrer">Ouvrir le brouillon dans Gmail</a></div>';
}
`;

export function buildArtifact({ write = true, now = new Date() } = {}) {
  const config = readJson('config/config.json');
  const communes = readJson('config/communes.json');
  const sources = readJson('config/sources.json');
  const market = readJson('dist/market.json');
  const dataStatus = readJson('dist/data-status.json');
  const referenceAccepted = readJson('data/history/reference-accepted.json');

  // Cohérence des fichiers validés : on s'arrête plutôt que de choisir une version.
  if (dataStatus.marketGeneratedAt !== market.generatedAt) throw new Error(`dist/data-status.json (${dataStatus.marketGeneratedAt}) ne correspond pas à dist/market.json (${market.generatedAt}).`);
  if (referenceAccepted.marketGeneratedAt !== market.generatedAt) throw new Error(`data/history/reference-accepted.json (${referenceAccepted.marketGeneratedAt}) ne correspond pas à dist/market.json (${market.generatedAt}).`);
  // Données privées : seuls des agrégats d'au moins N logements peuvent figurer dans le marché publié.
  const minListings = config.emeraude.minListingsToPublishAggregate;
  for (const s of (market.emeraude && market.emeraude.segments) || []) {
    if (!(s.listings >= minListings)) throw new Error(`dist/market.json : segment Émeraude de moins de ${minListings} logements — publication refusée.`);
  }

  const engine = bundleModules('engine', ENGINE_ORDER, 'window.EmeraudeEngine={estimate:estimate,ENGINE_VERSION:ENGINE_VERSION};');
  const engineVersion = /ENGINE_VERSION = '([^']+)'/.exec(fs.readFileSync(p('engine/index.js'), 'utf8'))[1];
  const snapshot = {
    builtAt: null, // rempli par stableBuild
    artifact: { name: ARTIFACT.name, version: ARTIFACT.version },
    config, communes, sources, market, dataStatus, referenceAccepted,
    referenceCases: RANGE_CASES,
    referenceBase: referenceRaw({})
  };

  // Le moteur embarqué doit reproduire les références validées avant toute écriture.
  const sandbox = { window: {} };
  vm.runInNewContext(engine, sandbox);
  const check = checkReferences(sandbox.window.EmeraudeEngine.estimate, snapshot);
  const failed = check.filter((x) => !x.ok);
  if (failed.length) throw new Error(`Logements de référence non reproduits : ${failed.map((x) => `${x.label} (${x.diff.join(', ')})`).join(' ; ')}`);

  let t = fs.readFileSync(p('embed/template.html'), 'utf8').replace(/\r\n/g, '\n');
  t = replaceOnce(t, '<!-- Fichier GÉNÉRÉ par scripts/build-embed.mjs à partir de embed/template.html : ne pas modifier à la main. -->',
    `<!-- Fichier GÉNÉRÉ par scripts/build-artifact.mjs à partir de embed/template.html : ne pas modifier à la main. -->\n<!-- ${ARTIFACT.name} · version ${ARTIFACT.version} -->`, 'commentaire de génération');
  t = replaceOnce(t, '</style>', `${CSS}</style>`, 'fin du CSS');
  t = replaceOnce(t, '<div class="app" id="app">\n', '<div class="app" id="app">\n<div class="banner bad" id="integrityBanner" hidden></div>\n', 'début de l\'application');
  t = replaceOnce(t, '<dt>Saisonnalité</dt><dd id="mSeason">—</dd>', '<dt>Nature</dt><dd id="mClass">—</dd>\n<dt>Saisonnalité</dt><dd id="mSeason">—</dd>\n<dt></dt><dd id="mSeasonClass">—</dd>', 'saisonnalité');
  t = replaceOnce(t, '<dt>Dernière actualisation</dt><dd id="mUpdated">—</dd>', '<dt>Version validée du</dt><dd id="mUpdated">—</dd>\n<dt>Dernière récupération</dt><dd id="mRetrieved">—</dd>', 'dernière actualisation');
  t = replaceOnce(t, '<div class="occ">', '<div class="quick" id="drMetrics"></div>\n\n<div class="occ">', 'bloc occupation');
  t = replaceOnce(t, '</aside>\n\n</div>\n', `</aside>\n\n</div>\n${DATA_PANEL}`, 'fin de la mise en page');
  t = replaceOnce(t, '<button class="btn primary" id="print" type="button">Présenter / imprimer</button>', '<button class="btn primary" id="print" type="button">Présenter au propriétaire</button>', 'bouton présenter');
  t = replaceOnce(t, 'Aperçu de la version imprimée. Dans l’outil Framer, « Présenter / imprimer » ouvre directement l’impression.', 'Vue de présentation à montrer au propriétaire.', 'texte de présentation');
  t = replaceOnce(t, "let marketSources=[{origin:'snapshot',data:SNAPSHOT.market,savedAt:fmtDate(SNAPSHOT.builtAt)}];",
    "/* Artifact : la version validée embarquée est la donnée de référence ; aucune récupération en ligne, aucun cache local. */\nlet marketSources=[{origin:'remote',data:SNAPSHOT.market}];", 'source des données');
  t = replaceOnce(t, 'render(r);\nrenderLegacy(raw);', 'render(r);\nrenderArtifactExtras(r);\nrenderLegacy(raw);', 'affichage du résultat');
  t = replaceOnce(t, '/* ---------- E-mail ---------- */', `${EXTRAS_JS}\n/* ---------- E-mail ---------- */`, 'section e-mail');
  t = replaceBlock(t, 'function openEmailModal(){', 'function closeEmailModal(){', OPEN_EMAIL, 'ouverture e-mail');
  t = replaceBlock(t, 'function prepareOwnerEmail(){', 'async function copyEmail(){', PREPARE_EMAIL, 'préparation e-mail');
  t = replaceOnce(t, "$('print').addEventListener('click',()=>{if(!last)return;if(IS_PREVIEW){root.classList.add('show-present');try{window.scrollTo({top:0});}catch(e){}}else window.print();});",
    "$('print').addEventListener('click',()=>{if(!last)return;root.classList.add('show-present');try{window.scrollTo({top:0});}catch(e){}});", 'présentation');
  t = replaceOnce(t, 'buildForm();setDefaults();calculate();\nloadData().then(()=>{buildForm();calculate();});',
    'renderDataPanel();\nbuildForm();setDefaults();calculate();\nrunIntegrityCheck();', 'démarrage');
  // Convention des dates : affichage en heure de Paris, quel que soit le fuseau de l'appareil.
  t = replaceOnce(t, "function fmtDate(iso){try{return new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date(iso));}catch(e){return String(iso||'');}}",
    "function fmtDate(iso){try{return new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'Europe/Paris'}).format(new Date(iso));}catch(e){return String(iso||'');}}\nfunction fmtDateTime(iso){try{const d=new Date(iso);return fmtDate(iso)+' à '+new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(d).replace(':',' h ');}catch(e){return String(iso||'');}}", 'format des dates');
  t = replaceOnce(t, "$('pDate').textContent=new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date());",
    "$('pDate').textContent=fmtDate(new Date().toISOString());", 'date de présentation');

  const fill = (x, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`%%${k}%%`).join(v), x);
  // Génération stable : builtAt = date du dernier changement réel de contenu (pas de modification artificielle).
  const res = stableBuild([ARTIFACT.output], (builtAt) => {
    const snap = safeJson({ ...snapshot, builtAt });
    // Les jetons sont remplis en dernier : le moteur et les données ne passent par aucun remplacement ci-dessus.
    const body = fill(t, {
      TESTBAR: '', LEGACY_SCRIPT: '', IS_PREVIEW: 'false', MARKET_URL: '', CONFIG_URL: '',
      V2_BADGE: `<div class="ver-badge">V2 DATA REFRESH · ${ARTIFACT.version}</div>`,
      ENGINE_VERSION: engineVersion, BUILT_AT: builtAt.slice(0, 10),
      ENGINE: engine, SNAPSHOT: snap
    });
    if (/%%[A-Z_]+%%/.test(body.replace(engine, '').replace(snap, ''))) throw new Error('Gabarit : jeton %%…%% non rempli.');
    return { [ARTIFACT.output]: `<title>${ARTIFACT.title}</title>\n${body}` };
  }, { write, now });
  const html = res.out[ARTIFACT.output];
  return { bytes: Buffer.byteLength(html), builtAt: res.builtAt, changed: res.changed, version: ARTIFACT.version, engineVersion, configVersion: config.version, marketGeneratedAt: market.generatedAt, references: check.map(({ label, ok, diff }) => ({ label, ok, diff })) };
}

if (process.argv[1].endsWith('build-artifact.mjs')) {
  const r = buildArtifact();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r)); // lu par scripts/refresh.mjs (dernière ligne)
  else {
    console.log(`${ARTIFACT.output} : ${(r.bytes / 1024).toFixed(0)} Ko · moteur ${r.engineVersion} · ${r.changed ? `régénéré (${r.builtAt})` : `contenu inchangé : aucun fichier réécrit (généré le ${r.builtAt})`}`);
    for (const x of r.references) console.log(`  ${x.ok ? 'OK ' : 'KO '} ${x.label}`);
  }
}

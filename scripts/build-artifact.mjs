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
// Présentation commerciale (2.3.0) : l'artifact met en avant les résultats et les trois scénarios ; sources et périodes
// de référence sont regroupées dans une rubrique « Méthodologie » repliée. Seul l'affichage change : le moteur, la
// configuration et les données sont inchangés, et l'Embed (embed/template.html) n'est pas concerné.
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
  name: 'Estimateur Émeraude',
  title: 'Estimateur Émeraude',
  version: '2.4.0',
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
export function checkReferences(estimate, snap, makeDate = (iso) => new Date(iso)) {
  const ref = snap.referenceAccepted;
  const today = makeDate(`${ref.computedFor}T12:00:00Z`);
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
/* Présentation commerciale : résultats et scénarios */
#emeraude-estimateur .hero-owner{margin-top:14px;padding:14px;border-radius:12px;background:var(--g);color:#fff}
#emeraude-estimateur .hero-owner span{display:block;font-size:12px;font-weight:700}
#emeraude-estimateur .hero-owner strong{display:block;font-size:32px;font-weight:900;line-height:1.1;margin:4px 0;font-variant-numeric:tabular-nums}
#emeraude-estimateur .hero-owner small{display:block;font-size:12px;line-height:1.4}
#emeraude-estimateur .potential{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
#emeraude-estimateur .potential .metric strong{font-size:22px;font-weight:850}
#emeraude-estimateur .sc-title{font-size:15px;font-weight:800;margin:18px 0 2px}
#emeraude-estimateur .sc-sub{font-size:12px;color:var(--muted);margin:0 0 8px}
#emeraude-estimateur .sc-row{border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:8px}
#emeraude-estimateur .sc-row.is-main{background:var(--g2);border-color:var(--g)}
#emeraude-estimateur .sc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
#emeraude-estimateur .sc-name{font-size:14px;font-weight:800}
#emeraude-estimateur .sc-diff{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}
#emeraude-estimateur .sc-row.is-main .sc-name,#emeraude-estimateur .sc-row.is-main .sc-diff{color:var(--g)}
#emeraude-estimateur .sc-amount{text-align:right;flex:none}
#emeraude-estimateur .sc-amount strong{display:block;font-size:24px;font-weight:900;line-height:1.1;font-variant-numeric:tabular-nums}
#emeraude-estimateur .sc-amount span{display:block;font-size:11px;color:var(--muted)}
#emeraude-estimateur .sc-row .bar{background:#dfe8e4}
#emeraude-estimateur .sc-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#emeraude-estimateur .sc-meta span{display:block;font-size:11px;color:var(--muted)}
#emeraude-estimateur .sc-meta b{font-size:13px;font-variant-numeric:tabular-nums}
#emeraude-estimateur .sc-row p{margin:8px 0 0;font-size:11px;color:var(--muted);line-height:1.45}
#emeraude-estimateur .detail-title{font-size:15px;font-weight:800;margin:18px 0 0}
#emeraude-estimateur .cleaning-notice{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--g2);font-size:12px;line-height:1.45}
#emeraude-estimateur .method-wrap{background:var(--card);margin-top:18px}
#emeraude-estimateur .method-wrap .dr-panel{margin-top:0;padding-bottom:14px}
@media(max-width:820px){#emeraude-estimateur .result{min-width:0}#emeraude-estimateur .mtable td:last-child{white-space:normal}}
`;

const DATA_PANEL = `
<details class="method method-wrap" id="dataPanel">
<summary>Méthodologie : sources et périodes de référence</summary>
<div class="dr-panel">
<p class="dr-note" id="drIntro">—</p>
<div class="dr-summary" id="drSummary"></div>
<div><div class="dr-sub">Marché retenu pour cette estimation</div></div>
<dl class="data-grid">
<dt>Zone</dt><dd id="mZone">—</dd>
<dt>Source</dt><dd id="mSource">—</dd>
<dt>Période</dt><dd id="mPeriod">—</dd>
<dt>Publiées</dt><dd id="mPublished">—</dd>
<dt>Marché observé</dt><dd id="mMarket">—</dd>
<dt>Nature</dt><dd id="mClass">—</dd>
<dt>Saisonnalité</dt><dd id="mSeason">—</dd>
<dt></dt><dd id="mSeasonClass">—</dd>
</dl>
<div><div class="dr-sub">Périodes de référence</div></div>
<div class="dr-scroll"><table class="dr-table" id="drFamilies"></table></div>
<div><div class="dr-sub">Nature des éléments du calcul</div><p class="dr-note">OBSERVÉE : statistique publiée par la source. PROXY : série d’un autre périmètre utilisée comme approximation. CALIBRATION : ratios issus d’autres villes. HYPOTHÈSE : règle ou coefficient du modèle Émeraude. FALLBACK : repli signalé.</p></div>
<div class="dr-scroll"><table class="dr-table" id="drClasses"></table></div>
<div><div class="dr-sub">Sources</div></div>
<div class="dr-scroll"><table class="dr-table" id="drSources"></table></div>
<footer class="dr-foot" id="drFoot"></footer>
</div>
</details>
`;

const EXTRAS_JS = `
/* ---------- Artifact : méthodologie, intégrité, comparaison des scénarios ---------- */
const DC_CLASS={'OBSERVÉE':'dc-obs','PROXY':'dc-proxy','CALIBRATION':'dc-cal','HYPOTHÈSE':'dc-hyp','FALLBACK':'dc-fb'};
function dcTag(c){return '<span class="dc '+(DC_CLASS[c]||'dc-hyp')+'">'+esc(c)+'</span>';}
/* Comparaison à l'affichage : écarts entre montants arrondis à la centaine, tels qu'ils sont présentés. Aucun calcul métier ici. */
function round100(n){return Math.round(n/100)*100;}
/* Noms présentés au propriétaire ; les identifiants et la configuration du moteur restent inchangés. */
const SC_LABEL={prudent:'Prudent',realiste:'Central',performant:'Optimiste'};
function scName(id){return SC_LABEL[id]||id;}
/* Les montants portent sur les seuls mois disponibles saisis, pas nécessairement sur douze mois. */
function availText(n){return num(n)+' mois disponible'+(n>1?'s':'');}
/* Forfait ménage : calculé depuis la grille, sauf montant saisi. Si le logement est incomplet, le moteur signale le champ concerné. */
function autoCleaningFee(){
const type=bundle.config.types[$('type').value]||{};
const fee=window.EmeraudeForfaitMenage.estimerForfaitMenage({isHouse:!!type.isHouse,area:$('area').value,bedrooms:$('bed').value,bathrooms:$('bath').value,guests:$('guest').value},SNAPSHOT.forfaitMenage);
return fee===null?bundle.config.defaults.cleaningFee:fee;
}
function cleaningNotice(fee){return 'Forfait ménage indicatif : '+euro(fee)+" par séjour. Payé par le voyageur et facturé au propriétaire par Émeraude. Ce montant n'est pas un revenu : ses frais Airbnb et la commission associée sont déduits du revenu propriétaire.";}
function scenarioGap(r,id){const d=round100(r.scenarios[id].ownerIncome)-round100(r.scenarios.realiste.ownerIncome);return (d>0?'+':d<0?'−':'')+euro(Math.abs(d));}
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

function cleanNote(n){return String(n||'').replace(/\\s*;\\s*(abaisse la confiance|confiance FAIBLE)\\.?$/i,'.');}

function renderDataPanel(){
const ds=SNAPSHOT.dataStatus,mk=SNAPSHOT.market;
$('drIntro').textContent='Sources publiques et périodes de référence utilisées par cet estimateur.';
const fam=ds.families.find(f=>f.id==='market')||{items:[]};
const it=fam.items[0]||{};
const tiles=[
['Données de marché',(ds.marketDataYear?'Année '+esc(ds.marketDataYear):'—')+' '+dcTag('OBSERVÉE')],
['Période couverte',it.periodEnd?'1<sup>er</sup> janv. – 31 déc. '+esc(it.periodEnd.slice(0,4)):'—'],
['Publication par la source',monthYear((mk.markets&&mk.markets[it.key]&&mk.markets[it.key].publishedAt)||'')]
];
$('drSummary').innerHTML=tiles.map(([k,v])=>'<div class="metric"><span>'+esc(k)+'</span><strong>'+v+'</strong></div>').join('');
let h='<thead><tr><th>Élément</th><th>Nature</th><th>Fin de période</th><th>Source</th></tr></thead><tbody>';
for(const f of ds.families){
h+='<tr class="fam"><td colspan="4">'+esc(f.label)+' · '+(f.role==='calcul'?'utilisé dans le calcul':'contrôle uniquement')+'</td></tr>';
for(const x of f.items){h+='<tr><td>'+esc(x.label)+'</td><td>'+dcTag(x.dataClass)+'</td><td class="num">'+esc(dayDate(x.periodEnd))+'</td><td>'+esc(sourceLabel(x.source))+'</td></tr>';}
}
$('drFamilies').innerHTML=h+'</tbody>';
$('drClasses').innerHTML='<thead><tr><th>Élément</th><th>Nature</th><th>Précision</th></tr></thead><tbody>'+ds.classification.map(c=>'<tr><td>'+esc(c.item)+'</td><td>'+dcTag(c.dataClass)+'</td><td>'+esc(cleanNote(c.note))+'</td></tr>').join('')+'</tbody>';
const used=['adt35_lighthouse','insee_hotels','eurostat_platforms','adt35_chiffres_cles','audiar_observatoire','inside_airbnb_structure'];
$('drSources').innerHTML='<thead><tr><th>Source</th><th>Usage</th><th>Licence</th></tr></thead><tbody>'+used.filter(id=>SNAPSHOT.sources.sources[id]).map(id=>{const s=SNAPSHOT.sources.sources[id];return '<tr><td>'+esc(s.label)+'</td><td>'+esc(s.usage||'')+'</td><td>'+esc(s.licence||'')+'</td></tr>';}).join('')+'</tbody>';
}

function renderArtifactExtras(r){
const s=r.scenarios.realiste,d=r.data;
const meta=((SNAPSHOT.market.markets||{})[d.marketKey]||{}).meta||{};
const own=d.geoRole==='epci'||d.geoRole==='commune';
$('mClass').innerHTML=own?dcTag(meta.dataClass||'OBSERVÉE')+' moyenne de l’intercommunalité, appliquée à la commune':dcTag('FALLBACK')+(d.geoRole==='epci_voisin'?' marché voisin':' données départementales');
$('mSeasonClass').innerHTML=dcTag(d.seasonality.fallback?'FALLBACK':'PROXY')+' profils départementaux, non locaux';
const tiles=[['Mois disponibles',num(s.monthsCount)+' mois · '+num(s.nightsAvailable)+' nuits'],['Séjours estimés × ménage',num(s.cleaning.stays)+' × '+euro(s.cleaning.feePerStay)]];
$('drMetrics').innerHTML=tiles.map(([k,v])=>'<div class="metric"><span>'+esc(k)+'</span><strong>'+v+'</strong></div>').join('');
}
`;

const BUILD_EMAIL = `function buildEmail(r){
const s=r.scenarios.realiste,d=r.data,p=r.property,cfg=bundle.config,S=summaryOf(r);
const subject='Votre estimation locative — Émeraude Conciergerie';
const lines=['Bonjour','','Suite à notre échange, voici l’estimation réalisée ensemble pour votre logement.','',
'LOGEMENT','• Commune : '+p.commune,'• Type : '+p.type,'• Surface : '+num(p.area,1)+' m²','• Chambres : '+p.bedrooms,'• Salle(s) de bain : '+p.bathrooms,'• Capacité : '+p.guests+' voyageurs','• Emplacement : '+p.location,
'• Disponibilité : '+(p.monthsMode==='select'?p.monthsSelected.map(m=>cfg.months.labels[m].toLowerCase()).join(', '):p.monthsCount+' mois/an'),'',
'VOTRE POTENTIEL LOCATIF (scénario central, sur '+availText(s.monthsCount)+')','• CA des nuits : environ '+euro(S.central),'• Revenu propriétaire après commission : environ '+euro(S.owner.central),'• Prix moyen estimé par nuit : environ '+euro(s.adr),'• Taux d’occupation estimé : environ '+pct(s.occupancy),'• CA moyen par mois disponible : environ '+e100(s.nightsRevenueMonthlyAverage),'',
'COMPARAISON DES SCÉNARIOS (sur '+availText(s.monthsCount)+')',...['prudent','realiste','performant'].map(id=>{const x=r.scenarios[id];return '• '+scName(id)+' : revenu propriétaire environ '+e100(x.ownerIncome)+(id==='realiste'?' (référence)':' ('+scenarioGap(r,id)+' par rapport au scénario central)')+' — CA des nuits environ '+e100(x.nightsRevenue)+' · '+pct(x.occupancy)+' · '+euro(x.adr)+'/nuit';}),'',
'DÉTAIL FINANCIER (scénario central, sur '+availText(s.monthsCount)+')','• Frais Airbnb sur les nuits (15,5 %) : environ '+e10(s.airbnb.onNights),'• Revenu des nuits net d’Airbnb : environ '+e100(s.nightsNetOfHostFee),'• Base de commission (nuits + ménage nets des frais Airbnb) : environ '+e100(s.commission.base),'• Commission Émeraude (taux indicatif '+pct(s.commission.rate,1)+', négocié pour chaque propriétaire) : environ '+e10(s.commission.amount),
'• '+cleaningNotice(s.cleaning.feePerStay),
'• Frais de ménage : '+euro(s.cleaning.feePerStay)+' par séjour, collectés séparément (environ '+e10(s.cleaning.collected)+' sur la période), inclus nets dans la base de commission ; les frais Airbnb sur le ménage (environ '+e10(s.cleaning.hostFee)+') restent à la charge du propriétaire et le ménage brut revient à Émeraude','',
'MÉTHODOLOGIE','• Marché de référence : '+d.zone+' — prix moyen '+euro(d.market.adr)+' / nuit, occupation '+pct(d.market.occupancy),'• Période de référence : '+d.periodText+' (publiées en '+d.publishedText+')','• Source : '+d.source.attribution,
...r.explanation.adjustments.items.filter(a=>Math.abs(a.adrEffectPct)>1e-9||Math.abs(a.occEffectPts)>1e-9).map(a=>'• Ajustement Émeraude — '+a.label+' : '+[Math.abs(a.adrEffectPct)>1e-9?'prix '+signedPct(a.adrEffectPct):'',Math.abs(a.occEffectPts)>1e-9?'occupation '+signedPts(a.occEffectPts):''].filter(Boolean).join(', ')),
'• Saisonnalité : '+r.explanation.adjustments.seasonality.label.toLowerCase()+' (mois par mois)','',
cfg.texts.disclaimer,'',cfg.texts.attribution+' '+cfg.texts.attributionSuffix,'','Bien cordialement,','Émeraude Conciergerie'];
return{subject:subject,body:lines.join('\\n')};
}
`;

const PRESENT_BOXES = `function presentBoxes(r){
const s=r.scenarios.realiste,S=summaryOf(r);
const b=[['CA des nuits sur '+availText(s.monthsCount)+' (scénario central)','≈ '+euro(S.central)],['Revenu propriétaire sur '+availText(s.monthsCount)+'*','≈ '+euro(S.owner.central)],['Prix moyen estimé / nuit','≈ '+euro(s.adr)],['Occupation estimée','≈ '+pct(s.occupancy)],['CA moyen / mois disponible',e100(s.nightsRevenueMonthlyAverage)],['Frais Airbnb sur les nuits (15,5 %)',e10(s.airbnb.onNights)],['Revenu des nuits net d’Airbnb',e100(s.nightsNetOfHostFee)]];
b.push(['Ménages collectés',e10(s.cleaning.collected)],['Ménages nets d’Airbnb',e10(s.cleaningNetOfHostFee)],['Frais Airbnb sur le ménage (charge propriétaire)',e10(s.cleaning.hostFee)],['Ménage brut revenant à Émeraude',e10(s.emeraude.cleaningNet)],['Base de commission (nuits + ménage nets)',e100(s.commission.base)],['Commission Émeraude (taux indicatif '+pct(s.commission.rate,1)+')',e10(s.commission.amount)]);
return b;
}

`;

const RENDER_SCENARIOS = `const maxOwner=Math.max(0,...['prudent','realiste','performant'].map(id=>round100(r.scenarios[id].ownerIncome)));
let sc='<div class="sc-title">Comparez vos trois scénarios</div><p class="sc-sub">Revenu propriétaire après commission sur '+availText(s.monthsCount)+', selon la performance du logement.</p>';
for(const id of ['prudent','realiste','performant']){
const x=r.scenarios[id],own=round100(x.ownerIncome),w0=maxOwner>0?Math.max(0,own/maxOwner*100):0;
sc+='<div class="sc-row'+(id==='realiste'?' is-main':'')+'"><div class="sc-top"><div><div class="sc-name">'+esc(scName(id))+'</div><span class="sc-diff">'+(id==='realiste'?'Scénario de référence':scenarioGap(r,id)+' par rapport au scénario central')+'</span></div><div class="sc-amount"><strong>'+e100(x.ownerIncome)+'</strong><span>revenu propriétaire</span></div></div><div class="bar" aria-hidden="true"><i style="width:'+w0.toFixed(1)+'%"></i></div><div class="sc-meta"><div><span>CA des nuits</span><b>'+e100(x.nightsRevenue)+'</b></div><div><span>Occupation</span><b>'+pct(x.occupancy)+'</b></div><div><span>Prix / nuit</span><b>'+euro(x.adr)+'</b></div></div><p>'+esc(x.description)+'</p></div>';
}
$('scenarios').innerHTML=sc;

`;

const PRESENT_SCENARIOS = `$('pCleaningNotice').textContent=cleaningNotice(r.scenarios.realiste.cleaning.feePerStay);
$('pScTitle').textContent='Scénarios sur '+availText(r.scenarios.realiste.monthsCount);
let t='<thead><tr><th>Scénario</th><th class="num">Occupation</th><th class="num">Prix / nuit</th><th class="num">CA des nuits</th><th class="num">Revenu propriétaire</th><th class="num">Écart / central</th></tr></thead><tbody>';
for(const id of ['prudent','realiste','performant']){const x=r.scenarios[id];t+='<tr><td><b>'+esc(scName(id))+'</b><br><span style="color:var(--muted);font-size:11px">'+esc(x.description)+'</span></td><td class="num">'+pct(x.occupancy)+'</td><td class="num">'+euro(x.adr)+'</td><td class="num">'+e100(x.nightsRevenue)+'</td><td class="num"><b>'+e100(x.ownerIncome)+'</b></td><td class="num">'+(id==='realiste'?'référence':scenarioGap(r,id))+'</td></tr>';}
`;

const PRESENT_METHOD = `$('pMethod').innerHTML='<p><b>Données de marché (observées)</b> — '+esc(d.zone)+' : prix moyen '+euro(d.market.adr)+' / nuit, occupation '+pct(d.market.occupancy)+', séjour moyen '+num(d.market.avgStay,1)+' nuits ; '+esc(d.periodText)+', publiées en '+esc(d.publishedText)+' (source : '+esc(d.source.attribution)+').</p>'
+'<p><b>Ajustements du modèle Émeraude (hypothèses)</b> — '+esc(e.adjustments.reference)+' Ajustements appliqués : '+e.adjustments.items.filter(a=>Math.abs(a.adrEffectPct)>1e-9||Math.abs(a.occEffectPts)>1e-9).map(a=>esc(a.label)).join(', ')+'. Saisonnalité : '+esc(e.adjustments.seasonality.label.toLowerCase())+'.</p>'
+'<p><b>Résultat estimé</b> — '+esc(bundle.config.texts.methodologyResult)+'</p>'
+(e.market.definitionNotes.length?'<p>'+e.market.definitionNotes.map(esc).join(' ')+'</p>':'');
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
  const forfaitMenage = readJson('config/forfait-menage.json');

  // Cohérence des fichiers validés : on s'arrête plutôt que de choisir une version.
  if (dataStatus.marketGeneratedAt !== market.generatedAt) throw new Error(`dist/data-status.json (${dataStatus.marketGeneratedAt}) ne correspond pas à dist/market.json (${market.generatedAt}).`);
  if (referenceAccepted.marketGeneratedAt !== market.generatedAt) throw new Error(`data/history/reference-accepted.json (${referenceAccepted.marketGeneratedAt}) ne correspond pas à dist/market.json (${market.generatedAt}).`);
  // Données privées : seuls des agrégats d'au moins N logements peuvent figurer dans le marché publié.
  const minListings = config.emeraude.minListingsToPublishAggregate;
  for (const s of (market.emeraude && market.emeraude.segments) || []) {
    if (!(s.listings >= minListings)) throw new Error(`dist/market.json : segment Émeraude de moins de ${minListings} logements — publication refusée.`);
  }

  const engine = bundleModules('engine', ENGINE_ORDER, 'window.EmeraudeEngine={estimate:estimate,ENGINE_VERSION:ENGINE_VERSION};');
  const forfaitScript = bundleModules('scripts/lib', ['forfait-menage.js'], 'window.EmeraudeForfaitMenage={estimerForfaitMenage:estimerForfaitMenage};');
  const engineVersion = /ENGINE_VERSION = '([^']+)'/.exec(fs.readFileSync(p('engine/index.js'), 'utf8'))[1];
  const snapshot = {
    builtAt: null, // rempli par stableBuild
    artifact: { name: ARTIFACT.name, version: ARTIFACT.version },
    config, communes, sources, market, dataStatus, referenceAccepted, forfaitMenage,
    referenceCases: RANGE_CASES,
    referenceBase: referenceRaw({})
  };

  // Le moteur embarqué doit reproduire les références validées avant toute écriture.
  const sandbox = { window: {} };
  vm.runInNewContext(engine, sandbox);
  const check = checkReferences(
  sandbox.window.EmeraudeEngine.estimate,
  snapshot,
  vm.runInContext('(iso) => new Date(iso)', sandbox)
);
  const failed = check.filter((x) => !x.ok);
  if (failed.length) throw new Error(`Logements de référence non reproduits : ${failed.map((x) => `${x.label} (${x.diff.join(', ')})`).join(' ; ')}`);

  let t = fs.readFileSync(p('embed/template.html'), 'utf8').replace(/\r\n/g, '\n');
  t = replaceOnce(t, '<!-- Fichier GÉNÉRÉ par scripts/build-embed.mjs à partir de embed/template.html : ne pas modifier à la main. -->',
    `<!-- Fichier GÉNÉRÉ par scripts/build-artifact.mjs à partir de embed/template.html : ne pas modifier à la main. -->\n<!-- ${ARTIFACT.name} · version ${ARTIFACT.version} -->`, 'commentaire de génération');
  t = replaceOnce(t, '</style>', `${CSS}</style>`, 'fin du CSS');
  t = replaceOnce(t, '<div class="app" id="app">\n', '<div class="app" id="app">\n<div class="banner bad" id="integrityBanner" hidden></div>\n', 'début de l\'application');
  // Présentation commerciale : en-tête, résultats puis scénarios ; méthodologie repliée en bas de page.
  t = replaceOnce(t, 'Estimateur interne : données publiques du marché local, ajustées par le modèle Émeraude.', 'Le potentiel de revenus de votre logement, calculé à partir du marché local et de ses caractéristiques.', 'sous-titre');
  t = replaceOnce(t, 'OUTIL INTERNE · ÉMERAUDE', 'ESTIMATION PERSONNALISÉE', 'badge');
  t = replaceBlock(t, '<div class="occ">', '<ul class="warnings"', '<div class="quick" id="drMetrics"></div>\n\n', 'bloc occupation et scénarios');
  t = replaceBlock(t, '<div class="data-block" id="marketData">', '<div class="hero">', '<div class="banner" id="fallbackBanner" hidden style="margin-bottom:12px"></div>\n\n', 'données de marché');
  t = replaceOnce(t, '<div class="hero-label">Estimation centrale · CA des nuits sur la période (scénario réaliste)</div>', '<div class="hero-label" id="heroLabel">Potentiel locatif estimé · CA des nuits sur la période (scénario central)</div>', 'libellé principal');
  t = replaceOnce(t, '<div class="hero-range" id="uncRange">—</div>\n', '', 'ligne de fourchette');
  t = replaceOnce(t, '<div class="hero-range" id="range">—</div>\n', '<div class="hero-range" id="range">—</div>\n<div class="hero-owner"><span>Revenu propriétaire après commission</span><strong id="heroOwner">—</strong><small id="heroOwnerMonthly">—</small></div>\n', 'revenu propriétaire');
  t = replaceBlock(t, '<div class="conf-block" id="confBlock">', '<div class="quick">', `<div class="potential">
<div class="metric"><span>Prix moyen estimé par nuit</span><strong id="adr">—</strong></div>
<div class="metric"><span>Nuits louées estimées</span><strong id="nightsBooked">—</strong></div>
</div>

<div class="occ">
<div class="occ-top"><span>Taux d’occupation estimé</span><span id="occ">—</span></div>
<div class="bar"><i id="bar"></i></div>
</div>

<div class="scenarios" id="scenarios"></div>

<div class="detail-title" id="detailTitle">Détail financier</div>
<div class="cleaning-notice" id="cleaningNotice"></div>

`, 'niveau de confiance');
  t = replaceOnce(t, '<h3>Données utilisées et méthode</h3>', '<h3>Méthodologie</h3>', 'titre méthode');
  // Les montants portent sur les mois disponibles saisis : aucun libellé « / an ».
  t = replaceOnce(t, '<span>CA des nuits / an</span>', '<span id="annualLabel">CA des nuits sur la période</span>', 'libellé CA');
  t = replaceOnce(t, "'Frais Airbnb sur les nuits')+' / an';", "'Frais Airbnb sur les nuits');", 'libellé frais Airbnb');
  for (const label of ['Commission Émeraude', 'Ménages collectés', 'Ménages nets d’Airbnb', 'Frais Airbnb sur le ménage (charge propriétaire)', 'Ménage brut revenant à Émeraude']) t = replaceOnce(t, `<span>${label} / an</span>`, `<span>${label}</span>`, `libellé ${label}`);
  t = replaceOnce(t, '<h3>Scénarios</h3>', '<div class="cleaning-notice" id="pCleaningNotice"></div>\n<h3 id="pScTitle">Scénarios</h3>', 'titre scénarios');
  // Forfait ménage automatique : le champ existant reste modifiable ; vide, il utilise la grille.
  t = replaceOnce(t, '<div class="field-error" id="err-cleaningFee" hidden></div>', '<div class="field-hint" id="cleaningHint"></div><div class="field-error" id="err-cleaningFee" hidden></div>', 'aide forfait ménage');
  t = replaceOnce(t, 'let stayEdited=false;', 'let stayEdited=false;\nlet cleaningEdited=false;', 'état forfait ménage');
  t = replaceOnce(t, "$('cleaningFee').value=d.cleaningFee;", "$('cleaningFee').value='';cleaningEdited=false;", 'valeur initiale du forfait');
  t = replaceOnce(t, "cleaningFee:$('cleaningFee').value,", "cleaningFee:cleaningEdited?$('cleaningFee').value:autoCleaningFee(),", 'lecture du forfait');
  t = replaceOnce(t, ",'commission','cleaningFee'].forEach", ",'commission'].forEach", 'événements du formulaire');
  t = replaceOnce(t, "$('stayLength').addEventListener('input',", "$('cleaningFee').addEventListener('input',()=>{cleaningEdited=$('cleaningFee').value.trim()!=='';calculate();});\n$('stayLength').addEventListener('input',", 'saisie du forfait');
  t = replaceOnce(t, '%%LEGACY_SCRIPT%%', '<script>\n%%FORFAIT_MENAGE%%\n</script>\n%%LEGACY_SCRIPT%%', 'script du forfait');
  // Vouvoiement dans les textes visibles par le propriétaire.
  t = replaceOnce(t, 'Renseigne les informations pendant la visite.', 'Renseignez les informations pendant la visite.', 'consigne logement');
  t = replaceOnce(t, 'Coche uniquement ce qui est réellement présent ou prévu.', 'Cochez uniquement ce qui est réellement présent ou prévu.', 'consigne équipements');
  t = replaceOnce(t, 'Indique l’adresse e-mail du propriétaire.', 'Indiquez l’adresse e-mail du propriétaire.', 'consigne e-mail');
  t = replaceBlock(t, "$('freshPill').className=", 'const S=summaryOf(r);', '', 'pastille fraîcheur');
  t = replaceBlock(t, '/* Millésime, âge et actualisation', 'const usedMarket=', '', 'âge des données');
  t = replaceBlock(t, "const sb=$('staleBanner');", "const fb=$('fallbackBanner');", '', 'alerte d\'ancienneté');
  t = replaceBlock(t, "$('uncRange').textContent=", "$('range').textContent=", '', 'fourchette principale');
  t = replaceBlock(t, "$('confPill2').className=", "$('adr').textContent=", "$('heroLabel').textContent='Potentiel locatif estimé · CA des nuits sur '+availText(s.monthsCount)+' (scénario central)';\n$('annualLabel').textContent='CA des nuits sur '+num(s.monthsCount)+' mois';\n$('detailTitle').textContent='Détail financier sur '+availText(s.monthsCount);\n$('heroOwner').textContent='≈ '+euro(S.owner.central);\n$('heroOwnerMonthly').textContent='sur '+availText(s.monthsCount)+', soit ≈ '+e100(s.ownerIncomeMonthlyAverage)+' / mois · avant fiscalité et charges';\n$('nightsBooked').textContent=num(s.nightsBooked);\nconst autoFee=autoCleaningFee();\n$('cleaningFee').placeholder=num(autoFee);\n$('cleaningHint').textContent=cleaningEdited?'Montant saisi (forfait indicatif calculé : '+euro(autoFee)+').':'Forfait indicatif calculé : '+euro(autoFee)+'. Saisissez un montant pour le remplacer.';\n$('cleaningNotice').textContent=cleaningNotice(s.cleaning.feePerStay);\n", 'niveau de confiance (affichage)');
  t = replaceOnce(t, "'fourchette '+euro(S.owner.low)+' à '+euro(S.owner.high)+' · soit ≈ '", "'soit ≈ '", 'revenu mensuel');
  t = replaceBlock(t, 'let sc=', 'const w=r.warnings.filter', RENDER_SCENARIOS, 'affichage des scénarios');
  t = replaceBlock(t, 'function presentBoxes(r){', 'function propertySummary(r){', PRESENT_BOXES, 'présentation : indicateurs');
  t = replaceBlock(t, "let t='<thead><tr><th>Scénario</th>", "$('pScenarios').innerHTML=", PRESENT_SCENARIOS, 'présentation : scénarios');
  t = replaceBlock(t, "$('pMethod').innerHTML=", "$('pFoot').textContent=", PRESENT_METHOD, 'présentation : méthode');
  t = replaceBlock(t, 'function buildEmail(r){', 'function openEmailModal(){', BUILD_EMAIL, 'e-mail propriétaire');
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
      V2_BADGE: '',
      ENGINE_VERSION: engineVersion, BUILT_AT: builtAt.slice(0, 10),
      ENGINE: engine, FORFAIT_MENAGE: forfaitScript, SNAPSHOT: snap
    });
    if (/%%[A-Z_]+%%/.test(body.replace(engine, '').replace(snap, '').replace(forfaitScript, ''))) throw new Error('Gabarit : jeton %%…%% non rempli.');
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

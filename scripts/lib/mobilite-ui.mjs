// Interface du parcours « bail mobilité » de l'artifact (2.5.0) : choix initial du type de location, formulaire,
// résultats, scénarios, résumé partageable et e-mail. Indépendante du parcours courte durée : ses identifiants sont
// préfixés « m », son script ne lit ni SNAPSHOT ni le moteur courte durée, et le moteur courte durée ne lit rien d'ici.
// Le calcul est fait exclusivement par engine/mobilite.js (window.EmeraudeMobilite).

export const MOB_CSS = `/* Choix du type de location et parcours bail mobilité (2.5.0) */
#emeraude-estimateur .parcours{max-width:1160px;margin:auto;padding:24px 16px 0}
#emeraude-estimateur .parcours-intro{margin-bottom:14px}
#emeraude-estimateur .parcours-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#emeraude-estimateur .parcours-card{display:grid;gap:6px;text-align:left;background:#fff;border:1px solid var(--border);border-radius:16px;padding:18px;cursor:pointer;color:var(--ink);font:inherit}
#emeraude-estimateur .parcours-card strong{font-size:18px;font-weight:850;color:var(--g)}
#emeraude-estimateur .parcours-card span{font-size:13px;color:var(--muted);line-height:1.45}
#emeraude-estimateur .parcours-card:hover,#emeraude-estimateur .parcours-card:focus-visible{border-color:var(--g);background:var(--g2);outline:none}
#emeraude-estimateur .parcours-tabs{display:flex;gap:6px;flex-wrap:wrap}
#emeraude-estimateur .parcours-tab{border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:750;color:var(--muted);cursor:pointer}
#emeraude-estimateur .parcours-tab[aria-pressed="true"]{background:var(--g);border-color:var(--g);color:#fff}
#emeraude-estimateur.choix-ouvert .parcours-tabs{display:none}
#emeraude-estimateur.show-present .parcours{display:none}
#emeraude-estimateur .mob .fields .wide{grid-column:1/-1}
#emeraude-estimateur .mob .sec-title{grid-column:1/-1;font-size:13px;font-weight:850;margin:10px 0 0;color:var(--g)}
#emeraude-estimateur .mob .sec-title:first-child{margin-top:0}
#emeraude-estimateur .mob .opt{font-weight:400;color:var(--muted)}
#emeraude-estimateur .mob .repere{grid-column:1/-1;border:1px dashed var(--border);border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.5;background:#fff}
#emeraude-estimateur .mob .repere b{font-variant-numeric:tabular-nums}
#emeraude-estimateur .mob .info{grid-column:1/-1;font-size:12px;line-height:1.5;color:var(--muted);background:var(--bg);border-radius:10px;padding:10px 12px}
#emeraude-estimateur .mob details.hyp{grid-column:1/-1;border:1px solid var(--border);border-radius:12px;padding:0 12px}
#emeraude-estimateur .mob details.hyp summary{cursor:pointer;font-weight:800;font-size:13px;padding:12px 0}
#emeraude-estimateur .mob .hyp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-bottom:12px}
#emeraude-estimateur .mob .missing{border-radius:12px;padding:14px;background:var(--bg);font-size:13px;line-height:1.5}
#emeraude-estimateur .mob .missing ul{margin:6px 0 0;padding-left:18px}
#emeraude-estimateur .mob .ftable{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
#emeraude-estimateur .mob .ftable td{padding:6px 0;border-top:1px solid var(--border);vertical-align:top}
#emeraude-estimateur .mob .ftable td:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;padding-left:10px}
#emeraude-estimateur .mob .ftable tr.total td{font-weight:850;color:var(--g);border-top:2px solid var(--g)}
#emeraude-estimateur .mob .ftable tr.sub td{color:var(--muted);font-size:12px}
#emeraude-estimateur .mob textarea.summary{width:100%;min-height:200px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);resize:vertical}
@media(max-width:820px){
#emeraude-estimateur .parcours-cards{grid-template-columns:1fr}
#emeraude-estimateur .mob .hyp-grid{grid-template-columns:1fr}
}
`;

export const CHOOSER_HTML = `<div class="parcours" id="parcours">
<div class="parcours-intro" id="parcoursIntro">
<div class="kicker">Émeraude Conciergerie</div>
<div class="title">Quel type de location souhaitez-vous estimer ?</div>
<div class="sub">Deux parcours indépendants, avec leurs propres règles et leurs propres calculs.</div>
</div>
<div class="parcours-cards" id="parcoursCards">
<button class="parcours-card" type="button" data-parcours="courte"><strong>Location courte durée Airbnb</strong><span>Séjours de quelques nuits. Estimation à partir des données du marché local de la location saisonnière.</span></button>
<button class="parcours-card" type="button" data-parcours="mobilite"><strong>Location en bail mobilité</strong><span>Logement meublé loué de 1 à 10 mois. Simulation à partir de vos loyers, de la durée des baux et de la vacance entre deux locataires.</span></button>
</div>
<div class="parcours-tabs" role="group" aria-label="Type de location">
<button class="parcours-tab" type="button" data-parcours="courte" aria-pressed="false">Courte durée Airbnb</button>
<button class="parcours-tab" type="button" data-parcours="mobilite" aria-pressed="false">Bail mobilité</button>
</div>
</div>
`;

const num = (id, label, attrs = '', hint = '', wide = false) =>
  `<div class="field${wide ? ' wide' : ''}"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" ${attrs}>${hint ? `<div class="field-hint">${hint}</div>` : ''}<div class="field-error" id="err-${id}" hidden></div></div>`;

export const MOB_HTML = `<div class="app mob" id="mobApp" hidden>
<header class="head">
<div>
<div class="kicker">Émeraude Conciergerie · Bail mobilité</div>
<div class="title">Simulation de revenus en bail mobilité</div>
<div class="sub">Loyers, vacance entre deux baux, frais et rémunération : chaque hypothèse est saisie et reste modifiable.</div>
</div>
<div class="pills"><div class="badge">SIMULATION PERSONNALISÉE</div></div>
</header>
<div class="top-actions">
<button class="btn small" id="mNew" type="button">↻ Nouvelle simulation</button>
<button class="btn small" id="mSendTop" type="button">✉ Envoyer au propriétaire</button>
</div>
<div class="layout">
<section class="card" aria-label="Logement et hypothèses de location">
<div class="section">Votre logement en bail mobilité<small>Les champs facultatifs non renseignés ne sont pas déduits : rien n’est complété à votre place.</small></div>
<div class="fields">
<div class="sec-title">Logement</div>
<div class="field"><label for="mCommune">Commune</label><select id="mCommune"></select><div class="field-error" id="err-mCommune" hidden></div></div>
<div class="field"><label for="mTypologie">Typologie</label><select id="mTypologie"></select><div class="field-error" id="err-mTypologie" hidden></div></div>
${num('mSurface', 'Surface (m²)', 'min="8" max="500" step="1"')}
<div class="repere" id="mRepere">—</div>
<div class="sec-title">Loyer et charges</div>
${num('mLoyer', 'Loyer mensuel hors charges (€)', 'min="0" step="10"', 'Loyer meublé envisagé, fixé par le propriétaire.')}
${num('mForfait', 'Forfait mensuel de charges (€)', 'min="0" step="5"', 'Saisissez 0 s’il n’y en a pas.')}
${num('mCharges', 'Charges annuelles réelles du logement (€ / an)', 'min="0" step="50"', 'Tout ce que le propriétaire paie dans l’année, y compris pendant la vacance : copropriété, énergie et eau si incluses, taxe foncière, assurance, entretien, abonnements… Saisissez 0 si aucune.', true)}
<div class="info" id="mChargesInfo"></div>
<div class="sec-title">Rotation des locataires</div>
${num('mDuree', 'Durée moyenne d’un bail (mois)', 'min="1" max="10" step="0.5"', 'Entre 1 et 10 mois (bail mobilité).')}
${num('mVacance', 'Vacance entre deux baux (mois)', 'min="0" max="12" step="0.5"', 'Mois sans locataire entre un départ et l’arrivée suivante. 0 si les baux s’enchaînent.')}
<div class="info" id="mVacanceInfo"></div>
${num('mMenage', 'Ménage par rotation (€) <span class="opt">facultatif</span>', 'min="0" step="5"')}
${num('mLinge', 'Linge par rotation (€) <span class="opt">facultatif</span>', 'min="0" step="5"')}
${num('mKit', 'Kit d’accueil et consommables par rotation (€) <span class="opt">facultatif</span>', 'min="0" step="5"')}
<div class="sec-title">Rémunération Émeraude</div>
<div class="field"><label for="mRemMode">Mode de rémunération</label><select id="mRemMode"></select><div class="field-hint">Négociée pour chaque logement : aucun taux n’est proposé.</div><div class="field-error" id="err-mRemMode" hidden></div></div>
<div class="field" id="mRemValeurWrap"><label for="mRemValeur" id="mRemValeurLabel">Montant</label><input id="mRemValeur" type="number" inputmode="decimal" min="0" step="0.5"><div class="field-error" id="err-mRemValeur" hidden></div></div>
<div class="field" id="mRemAssietteWrap" hidden><label for="mRemAssiette">Assiette</label><select id="mRemAssiette"></select><div class="field-error" id="err-mRemAssiette" hidden></div></div>
${num('mRemRotation', 'Frais de mise en place par rotation (€) <span class="opt">facultatif</span>', 'min="0" step="5"')}
${num('mRemAnnuels', 'Frais fixes annuels Émeraude (€) <span class="opt">facultatif</span>', 'min="0" step="10"')}
<div class="sec-title">Frais de plateforme</div>
<div class="field"><label for="mPlatMode">Plateforme de location</label><select id="mPlatMode"></select><div class="field-error" id="err-mPlatMode" hidden></div></div>
<div class="field" id="mPlatValeurWrap" hidden><label for="mPlatValeur" id="mPlatValeurLabel">Valeur</label><input id="mPlatValeur" type="number" inputmode="decimal" min="0" step="0.5"><div class="field-error" id="err-mPlatValeur" hidden></div></div>
<details class="hyp" id="mHyp">
<summary>Hypothèses des scénarios (modifiables)</summary>
<div class="hyp-grid">
<p class="field-hint" style="grid-column:1/-1;margin:0" id="mHypNote"></p>
${num('mPrudDepart', 'Prudent : départ anticipé (mois)', 'min="0" max="3" step="0.5"', 'Préavis légal du locataire : un mois.')}
${num('mPrudVacance', 'Prudent : vacance supplémentaire (mois)', 'min="-3" max="6" step="0.5"')}
${num('mOptiDepart', 'Optimiste : départ anticipé (mois)', 'min="0" max="3" step="0.5"')}
${num('mOptiVacance', 'Optimiste : vacance supplémentaire (mois)', 'min="-3" max="6" step="0.5"')}
</div>
</details>
</div>
</section>
<aside class="result" aria-live="polite">
<div class="card">
<div id="mMissing" class="missing"></div>
<div id="mResult" hidden>
<div class="hero">
<div class="hero-label">Revenu net estimé du propriétaire · scénario central, sur 12 mois</div>
<div class="hero-val" id="mNet">—</div>
<div class="hero-range" id="mNetMonthly">—</div>
</div>
<div class="quick">
<div class="metric"><span>Mois loués par an</span><strong id="mMois">—</strong></div>
<div class="metric"><span>Rotations par an</span><strong id="mRot">—</strong></div>
<div class="metric"><span>Occupation annuelle</span><strong id="mOcc">—</strong></div>
<div class="metric"><span>Mois sans locataire</span><strong id="mVac">—</strong></div>
</div>
<div class="detail-title">Détail sur 12 mois (scénario central)</div>
<table class="ftable" id="mTable"></table>
<p class="note" id="mChargesNote"></p>
<div class="sc-title">Comparez les trois scénarios</div>
<p class="sc-sub">Revenu net du propriétaire sur 12 mois, selon la durée des baux et la vacance.</p>
<div id="mScenarios"></div>
<ul class="warnings" id="mWarnings"></ul>
<div class="actions">
<button class="btn primary" id="mEmail" type="button">Préparer l’e-mail au propriétaire</button>
<button class="btn" id="mCopy" type="button">Copier le résumé</button>
</div>
<div class="mail-status" id="mCopyStatus" role="status"></div>
<details class="method"><summary>Résumé partageable</summary><div class="method-body"><textarea class="summary" id="mSummary" readonly aria-label="Résumé partageable"></textarea></div></details>
<details class="method" id="mMethod"><summary>Méthodologie et sources</summary><div class="method-body" id="mMethodBody"></div></details>
<p class="note" id="mDisclaimer"></p>
</div>
</div>
</aside>
</div>
<div class="modal-backdrop" id="mEmailModal" role="dialog" aria-modal="true" aria-labelledby="mEmailTitle">
<div class="modal">
<h3 id="mEmailTitle">Envoyer la simulation au propriétaire</h3>
<p>Vérifiez le texte préparé. Copiez-le dans votre messagerie, ou indiquez l’adresse du propriétaire pour ouvrir un brouillon Gmail prérempli. Rien n’est envoyé automatiquement.</p>
<label for="mOwnerEmail" style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Adresse e-mail du propriétaire</label>
<input id="mOwnerEmail" type="email" inputmode="email" autocomplete="email" placeholder="proprietaire@exemple.fr">
<div style="margin-top:12px"><label for="mEmailPreview" style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Contenu de l’e-mail</label><textarea id="mEmailPreview" readonly></textarea></div>
<div class="mail-status" id="mMailStatus" role="status"></div>
<div class="modal-actions">
<button class="btn" id="mCancelEmail" type="button">Fermer</button>
<button class="btn" id="mCopyEmail" type="button">Copier le texte</button>
<button class="btn primary" id="mPrepareEmail" type="button">Préparer l’e-mail</button>
</div>
</div>
</div>
</div>
`;

// Script du parcours : lit uniquement MOBILITE (config/mobilite.json + repères) et window.EmeraudeMobilite.
export const MOB_JS = `(()=>{
'use strict';
const root=document.getElementById('emeraude-estimateur');
if(!root)return;
const $=id=>root.querySelector('#'+id);
const M=window.EmeraudeMobilite,CFG=MOBILITE.config,REP=MOBILITE.reperes;
const eur=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const ARR=CFG.arrondis.euros;
function e10(n){return (typeof n==='number'&&isFinite(n))?eur.format(Math.round(n/ARR)*ARR):'—';}
function mois(n){return (typeof n==='number'&&isFinite(n))?(Math.round(n*10)/10).toLocaleString('fr-FR',{maximumFractionDigits:1}):'—';}
function pct(n){return (typeof n==='number'&&isFinite(n))?Math.round(n*100)+' %':'—';}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function opts(sel,entries,first){sel.innerHTML=(first?'<option value="">'+esc(first)+'</option>':'')+entries.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');}
let last=null;

/* ---------- Choix du parcours : courte durée ou bail mobilité ---------- */
function choisir(p){
root.classList.remove('choix-ouvert');
$('parcoursIntro').hidden=true;$('parcoursCards').hidden=true;
$('app').hidden=p!=='courte';$('mobApp').hidden=p!=='mobilite';
root.querySelectorAll('.parcours-tab').forEach(b=>b.setAttribute('aria-pressed',b.dataset.parcours===p?'true':'false'));
try{window.scrollTo({top:0});}catch(e){}
}
root.classList.add('choix-ouvert');
root.querySelectorAll('[data-parcours]').forEach(b=>b.addEventListener('click',()=>choisir(b.dataset.parcours)));

/* ---------- Formulaire ---------- */
opts($('mCommune'),Object.entries(REP.communes).map(([k,c])=>[k,c.label]),'Choisir…');
opts($('mTypologie'),Object.entries(CFG.typologies).map(([k,t])=>[k,t.label]),'Choisir…');
opts($('mRemMode'),Object.entries(CFG.remuneration.modes),'Choisir…');
opts($('mRemAssiette'),Object.entries(CFG.remuneration.assiettes),'Choisir…');
opts($('mPlatMode'),Object.entries(CFG.plateforme.modes),'Choisir…');
$('mChargesInfo').textContent=CFG.texts.charges;
$('mVacanceInfo').textContent=CFG.texts.vacance;
$('mHypNote').textContent=CFG.scenarios.note;
$('mDisclaimer').textContent=CFG.texts.avertissement;
function hypDefaults(){$('mPrudDepart').value=CFG.scenarios.prudent.departAnticipeMois;$('mPrudVacance').value=CFG.scenarios.prudent.vacanceSupplementaireMois;$('mOptiDepart').value=CFG.scenarios.optimiste.departAnticipeMois;$('mOptiVacance').value=CFG.scenarios.optimiste.vacanceSupplementaireMois;}
hypDefaults();
const v=id=>$(id).value;
function raw(){return{commune:v('mCommune'),typologie:v('mTypologie'),surface:v('mSurface'),loyer:v('mLoyer'),forfaitCharges:v('mForfait'),chargesAnnuelles:v('mCharges'),dureeBail:v('mDuree'),vacance:v('mVacance'),menage:v('mMenage'),linge:v('mLinge'),kit:v('mKit'),
remuneration:{mode:v('mRemMode'),valeur:v('mRemValeur'),assiette:v('mRemAssiette'),fraisRotation:v('mRemRotation'),fraisAnnuels:v('mRemAnnuels')},
plateforme:{mode:v('mPlatMode'),valeur:v('mPlatValeur')},
hypotheses:{prudent:{departAnticipeMois:v('mPrudDepart'),vacanceSupplementaireMois:v('mPrudVacance')},optimiste:{departAnticipeMois:v('mOptiDepart'),vacanceSupplementaireMois:v('mOptiVacance')}}};}
const ERR_FIELDS={commune:'mCommune',typologie:'mTypologie',surface:'mSurface',loyer:'mLoyer',forfaitCharges:'mForfait',chargesAnnuelles:'mCharges',dureeBail:'mDuree',vacance:'mVacance',menage:'mMenage',linge:'mLinge',kit:'mKit',remunerationMode:'mRemMode',remunerationValeur:'mRemValeur',remunerationAssiette:'mRemAssiette',remuneration_fraisRotation:'mRemRotation',remuneration_fraisAnnuels:'mRemAnnuels',plateformeMode:'mPlatMode',plateformeValeur:'mPlatValeur'};
const touched=new Set();

function renderModes(){
const m=v('mRemMode');
$('mRemValeurWrap').hidden=!m;$('mRemAssietteWrap').hidden=m!=='pourcentage';
$('mRemValeurLabel').textContent=m==='pourcentage'?'Pourcentage (%)':m==='forfait_mensuel'?'Forfait par mois de collaboration (€)':m==='forfait_mois_loue'?'Forfait par mois loué (€)':'Forfait par rotation (€)';
const p=v('mPlatMode');$('mPlatValeurWrap').hidden=!p||p==='aucun';
$('mPlatValeurLabel').textContent=p==='pourcentage_loyer'?'Pourcentage du loyer (%)':'Forfait par bail signé (€)';
}

function renderRepere(){
const c=REP.communes[v('mCommune')],t=CFG.typologies[v('mTypologie')];
const box=$('mRepere');
if(!c||!t){box.innerHTML='<b>Repère de loyer</b> : choisissez la commune et la typologie. '+esc(REP.meuble.note);return;}
const x=c[t.repere];
if(!x){box.innerHTML='<b>Aucun repère publié</b> pour '+esc(c.label)+' et cette typologie : loyer à saisir à partir d’annonces meublées comparables.';return;}
const s=Number(v('mSurface'));
const range=s>0?' Pour '+s.toLocaleString('fr-FR')+' m² : environ <b>'+eur.format(Math.round(x.basM2*s/10)*10)+' à '+eur.format(Math.round(x.hautM2*s/10)*10)+' par mois</b>, charges comprises.':'';
box.innerHTML='<b>Repère indicatif, location nue</b> à '+esc(c.label)+' : '+x.basM2.toLocaleString('fr-FR')+' à '+x.hautM2.toLocaleString('fr-FR')+' €/m² charges comprises'+(x.fiabilite==='faible'?' (<b>fiabilité faible</b> : estimation de secteur, peu d’annonces)':'')+'.'+range+' '+esc(CFG.texts.repere)+' '+esc(REP.meuble.note);
}

function showErrors(errors){
root.querySelectorAll('#mobApp .field-error').forEach(e=>{e.hidden=true;e.textContent='';});
root.querySelectorAll('#mobApp input[aria-invalid],#mobApp select[aria-invalid]').forEach(e=>e.removeAttribute('aria-invalid'));
for(const [k,msg] of Object.entries(errors||{})){const id=ERR_FIELDS[k];if(!id||!touched.has(id))continue;const e=$('err-'+id);if(e){e.hidden=false;e.textContent=msg;}$(id).setAttribute('aria-invalid','true');}
}

function row(l,val,cls){return '<tr'+(cls?' class="'+cls+'"':'')+'><td>'+l+'</td><td>'+val+'</td></tr>';}
function minus(n){return n>0?'− '+e10(n):e10(0);}

function calculate(){
renderModes();renderRepere();
const r=M.estimerMobilite(raw(),CFG,REP);
last=r.ok?r:null;
showErrors(r.errors);
$('mResult').hidden=!r.ok;$('mMissing').hidden=r.ok;
if(!r.ok){
const list=Object.values(r.errors||{});
$('mMissing').innerHTML='<b>Pour afficher la simulation, renseignez :</b><ul>'+list.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p class="note">'+esc(REP.dureeBail.note)+' '+esc(REP.vacance.note)+'</p>';
return;
}
const c=r.scenarios.central;
$('mNet').textContent='≈ '+e10(c.revenuNet);
$('mNetMonthly').textContent='soit ≈ '+e10(c.revenuNetMensuelMoyen)+' par mois en moyenne · avant impôts';
$('mMois').textContent=mois(c.moisLoues)+' mois';
$('mRot').textContent='≈ '+mois(c.rotations);
$('mOcc').textContent=pct(c.occupation);
$('mVac').textContent=mois(c.moisVacants)+' mois';
const f=c.frais,rm=c.remuneration;
$('mTable').innerHTML=row('Revenu locatif brut (loyers perçus)',e10(c.revenuLocatifBrut))
+row('Charges récupérées (forfait de charges)',e10(c.chargesRecuperees))
+row('Total encaissé par le propriétaire',e10(c.encaisse),'sub')
+row('Charges réelles du logement (12 mois)',minus(f.chargesAnnuelles))
+row('Frais de plateforme',minus(f.plateforme))
+row('Ménage, linge et kit d’accueil ('+mois(c.rotations)+' rotations)',minus(f.rotation))
+row('Rémunération Émeraude',minus(rm.total))
+(rm.rotation||rm.annuelle?row('dont frais complémentaires',e10(rm.rotation+rm.annuelle),'sub'):'')
+row('Revenu net estimé du propriétaire',e10(c.revenuNet),'total');
$('mChargesNote').textContent=CFG.texts.charges+' Charges réelles non couvertes par le forfait : '+e10(c.chargesNonCouvertes)+'. Vacance : environ '+mois(c.moisVacants)+' mois sans loyer, soit ≈ '+e10(c.loyerNonPercuVacance)+' de loyers non perçus.';
const max=Math.max(1,...['prudent','central','optimiste'].map(id=>r.scenarios[id].revenuNet));
$('mScenarios').innerHTML=['prudent','central','optimiste'].map(id=>{const s=r.scenarios[id],h=s.hypotheses;const w=Math.max(0,s.revenuNet/max*100);
const d=Math.round(s.revenuNet/ARR)*ARR-Math.round(c.revenuNet/ARR)*ARR;
return '<div class="sc-row'+(id==='central'?' is-main':'')+'"><div class="sc-top"><div><div class="sc-name">'+esc(s.label)+'</div><span class="sc-diff">'+(id==='central'?'Scénario de référence':(d>0?'+':d<0?'−':'')+eur.format(Math.abs(d))+' par rapport au scénario central')+'</span></div><div class="sc-amount"><strong>'+e10(s.revenuNet)+'</strong><span>revenu net / an</span></div></div><div class="bar" aria-hidden="true"><i style="width:'+w.toFixed(1)+'%"></i></div><div class="sc-meta"><div><span>Mois loués</span><b>'+mois(s.moisLoues)+'</b></div><div><span>Rotations</span><b>'+mois(s.rotations)+'</b></div><div><span>Bail / vacance</span><b>'+mois(h.dureeBail)+' / '+mois(h.vacance)+' mois</b></div></div><p>'+esc(s.description)+'</p></div>';}).join('');
$('mWarnings').innerHTML=r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('');
$('mSummary').value=summary(r);
$('mMethodBody').innerHTML=method(r);
}

function summary(r){
const s=r.saisie,c=r.scenarios.central,t=CFG.typologies[s.typologie].label,cm=REP.communes[s.commune].label;
const rem=s.remuneration,remTxt=rem.mode==='pourcentage'?(rem.valeur.toLocaleString('fr-FR')+' % ('+CFG.remuneration.assiettes[rem.assiette].toLowerCase()+')'):(CFG.remuneration.modes[rem.mode]+' : '+eur.format(rem.valeur));
const L=['SIMULATION BAIL MOBILITÉ — ÉMERAUDE CONCIERGERIE','',
'LOGEMENT','• '+t+' de '+s.surface.toLocaleString('fr-FR')+' m² à '+cm,'',
'HYPOTHÈSES SAISIES','• Loyer : '+eur.format(s.loyer)+' / mois hors charges ; forfait de charges : '+eur.format(s.forfaitCharges)+' / mois','• Durée moyenne d’un bail : '+mois(s.dureeBail)+' mois ; vacance entre deux baux : '+mois(s.vacance)+' mois','• Charges réelles du logement : '+eur.format(s.chargesAnnuelles)+' / an','• Rémunération Émeraude : '+remTxt+(rem.fraisRotation?' ; frais de mise en place : '+eur.format(rem.fraisRotation)+' / rotation':'')+(rem.fraisAnnuels?' ; frais fixes : '+eur.format(rem.fraisAnnuels)+' / an':''),'• Frais de plateforme : '+CFG.plateforme.modes[s.plateforme.mode]+(s.plateforme.valeur!==null?' ('+s.plateforme.valeur.toLocaleString('fr-FR')+(s.plateforme.mode==='pourcentage_loyer'?' %':' €')+')':''),
...(r.nonRenseignes.length?['• Non renseignés, non déduits : '+r.nonRenseignes.join(', ')]:[]),'',
'RÉSULTAT (scénario central, sur 12 mois)','• Mois loués : '+mois(c.moisLoues)+' ; rotations : ≈ '+mois(c.rotations)+' ; occupation annuelle : '+pct(c.occupation),'• Revenu locatif brut : ≈ '+e10(c.revenuLocatifBrut),'• Charges récupérées (forfait) : ≈ '+e10(c.chargesRecuperees),'• Charges réelles, frais et ménage : ≈ '+e10(c.frais.total),'• Rémunération Émeraude : ≈ '+e10(c.remuneration.total),'• Revenu net estimé du propriétaire : ≈ '+e10(c.revenuNet)+' (≈ '+e10(c.revenuNetMensuelMoyen)+' / mois en moyenne, avant impôts)','',
'SCÉNARIOS (revenu net sur 12 mois)',...['prudent','central','optimiste'].map(id=>{const x=r.scenarios[id];return '• '+x.label+' : ≈ '+e10(x.revenuNet)+' — '+mois(x.moisLoues)+' mois loués ('+x.description+')';}),'',
CFG.texts.avertissement];
return L.join('\\n');
}

function method(r){
const sc=CFG.scenarios;
return '<div><h4>Calcul</h4><p>Cycle = durée du bail + vacance. Rotations par an = 12 ÷ cycle. Mois loués = min(12 ; rotations × durée du bail). Pendant un bail signé, le logement est occupé à 100 %. Occupation annuelle = mois loués ÷ 12.</p><p>Revenu net = loyers + forfait de charges perçus − charges réelles annuelles − frais de plateforme − ménage, linge et kit à chaque rotation − rémunération Émeraude.</p></div>'
+'<div><h4>Hypothèses des scénarios <span class="tag hyp">hypothèse</span></h4><p>'+esc(sc.note)+'</p><p>'+['prudent','central','optimiste'].map(id=>'<b>'+esc(sc[id].label)+'</b> : '+esc(sc[id].description)).join('<br>')+'</p></div>'
+'<div><h4>Charges</h4><p>'+esc(CFG.texts.charges)+'</p></div>'
+'<div><h4>Vacance</h4><p>'+esc(CFG.texts.vacance)+'</p></div>'
+'<div><h4>Données de marché</h4><p>'+esc(CFG.texts.sansDonnees)+'</p><p>'+esc(CFG.texts.repere)+'</p><p>'+esc(CFG.texts.attribution)+'</p></div>'
+'<div><h4>Cadre</h4><p>'+esc(CFG.cadreLegal.texte)+' '+esc(CFG.cadreLegal.note)+'</p></div>'
+'<p class="note">Moteur bail mobilité '+esc(r.engineVersion)+' · configuration '+esc(r.configVersion)+' · indépendant du parcours courte durée.</p>';
}

/* ---------- Résumé et e-mail ---------- */
async function copyText(text,status){try{await navigator.clipboard.writeText(text);status.textContent='Texte copié.';}catch(e){status.textContent='Copie impossible : sélectionnez le texte manuellement.';}}
function emailBody(){return 'Bonjour,\\n\\nSuite à notre échange, voici la simulation réalisée pour la location de votre logement en bail mobilité.\\n\\n'+summary(last)+'\\n\\nBien cordialement,\\nÉmeraude Conciergerie';}
function openEmail(){if(!last){$('mMissing').scrollIntoView&&$('mMissing').scrollIntoView({block:'center'});return;}$('mMailStatus').textContent='';$('mEmailPreview').value='Objet : Votre simulation en bail mobilité — Émeraude Conciergerie\\n\\n'+emailBody();$('mEmailModal').classList.add('open');setTimeout(()=>$('mOwnerEmail').focus(),50);}
$('mEmail').addEventListener('click',openEmail);
$('mSendTop').addEventListener('click',openEmail);
$('mCancelEmail').addEventListener('click',()=>$('mEmailModal').classList.remove('open'));
$('mCopyEmail').addEventListener('click',()=>copyText($('mEmailPreview').value,$('mMailStatus')));
$('mCopy').addEventListener('click',()=>last&&copyText($('mSummary').value,$('mCopyStatus')));
$('mPrepareEmail').addEventListener('click',()=>{
const email=$('mOwnerEmail').value.trim();
if(!email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){$('mMailStatus').textContent='Merci d’indiquer une adresse e-mail valide.';return;}
const gmail='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+encodeURIComponent('Votre simulation en bail mobilité — Émeraude Conciergerie')+'&body='+encodeURIComponent(emailBody());
$('mMailStatus').innerHTML='Brouillon prêt pour '+esc(email)+'. Rien n’est envoyé automatiquement.<div class="mail-links"><a href="'+esc(gmail)+'" target="_blank" rel="noopener noreferrer">Ouvrir le brouillon dans Gmail</a></div>';
});
$('mNew').addEventListener('click',()=>{root.querySelectorAll('#mobApp .fields input,#mobApp .fields select').forEach(e=>{e.value='';});hypDefaults();touched.clear();calculate();});
root.querySelectorAll('#mobApp .fields input,#mobApp .fields select').forEach(e=>{const h=()=>{touched.add(e.id);calculate();};e.addEventListener('input',h);e.addEventListener('change',h);});
calculate();
})();
`;

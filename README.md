# Estimateur de revenus locatifs — Émeraude Conciergerie (V2)

Moteur d'estimation de location courte durée **indépendant des fournisseurs de données**, alimenté uniquement par des **données publiques gratuites**, avec une architecture prête à recevoir plus tard des données internes Émeraude ou une API payante, sans reconstruire le moteur.

> État : phases 0 à 3 terminées (sauvegarde, moteur, comparaison, préversion). **Rien n'est déployé dans Framer.** La migration (phases 4 à 6) attend une validation explicite.

## Les quatre couches

```
1. SOURCES            data/raw/ + scripts/adapters/   (une source = un adaptateur)
2. NORMALISATION      scripts/normalize.mjs → validate.mjs → build-market.mjs → dist/market.json
3. MOTEUR             engine/ (fonctions pures, aucun chiffre métier en dur)
4. INTERFACE          embed/template.html → embed/estimateur-v2.html (Framer) + dist/preview.html (test)
```

Les coefficients et paramètres métier sont **tous** dans `config/config.json`. Les communes et intercommunalités sont dans `config/communes.json`. Les sources, licences et définitions sont dans `config/sources.json`.

## Présentation commerciale de l'artifact (documentation interne)

Depuis la version 2.3.0, `scripts/build-artifact.mjs` adapte uniquement l'affichage de l'artifact. Le moteur continue de calculer fraîcheur, niveau de confiance et fourchette du modèle (`summary.low`, `summary.high`, `summary.uncertaintyPct`, `summary.confidence`, y compris sur le revenu propriétaire), mais ces valeurs ne sont plus affichées au propriétaire. Les scénarios `realiste` et `performant` sont présentés sous les noms « Central » et « Optimiste » ; leurs identifiants et leurs hypothèses sont inchangés. L'Embed (`embed/template.html`) n'est pas concerné.

## Parcours « bail mobilité » (version 2.5.0)

L'artifact propose d'abord un choix : **Location courte durée Airbnb** (parcours existant, inchangé : moteur 1.3.1, mêmes formules, mêmes données) ou **Location en bail mobilité** (parcours nouveau et indépendant).

| Élément | Fichier | Remarque |
|---|---|---|
| Moteur | `engine/mobilite.js` (moteur bail mobilité 1.0.0) | Aucun import du moteur courte durée ; les empreintes des 8 fichiers figés d'`engine/` ne changent pas |
| Configuration | `config/mobilite.json` + `schemas/mobilite-config.schema.json` | Bornes, typologies, modes de rémunération et de plateforme, hypothèses des scénarios ; aucun taux ni montant par défaut |
| Repères | `data/mobilite/reperes-loyers.json` + `schemas/mobilite-reperes.schema.json` | Construits par `node scripts/build-mobilite-reperes.mjs` à partir de la Carte des loyers 2025 déjà présente dans `data/raw/carte-loyers/` (location **nue**, repère affiché, jamais utilisé dans le calcul) |
| Interface | `scripts/lib/mobilite-ui.mjs`, assemblée par `scripts/build-artifact.mjs` | Identifiants préfixés `m`, script et données séparés (`MOBILITE`) |
| Tests | `tests/mobilite.test.mjs` (18) | Dont la parité stricte du parcours courte durée sur 288 cas (`tests/fixtures/courte-duree-parite.json`, `node scripts/audit/parite-courte-duree.mjs` ; données de marché figées dans `tests/fixtures/courte-duree-parite-market.json` pour que l'actualisation automatique ne fasse pas échouer ce contrôle) |

Calcul : cycle = durée du bail + vacance ; rotations = 12 ÷ cycle ; mois loués = min(12 ; rotations × durée) ; occupation pendant un bail = 100 %. Revenu net = loyers + forfait de charges perçus − charges réelles annuelles − frais de plateforme − (ménage + linge + kit) × rotations − rémunération Émeraude. Le forfait de charges est affiché comme « charges récupérées », jamais comme un revenu net. Scénarios : prudent (départ un mois plus tôt, préavis légal, et un mois de vacance en plus), central (valeurs saisies), optimiste (vacance réduite d'un demi-mois) : hypothèses Émeraude, modifiables dans l'outil.

Aucune source publique fiable n’a été trouvée pour les loyers de bail mobilité, la durée moyenne des baux ou la vacance par commune : durée et vacance sont saisies ; depuis 2.6.0, le loyer est estimé à partir de références de location nue et meublée (ci-dessous), jamais présenté comme une valeur de marché certaine. Les données Lighthouse, AirROI, Eurostat et Insee ne sont pas utilisées par ce parcours.

### Loyer conseillé calculé automatiquement (version 2.6.0, moteur bail mobilité 1.1.0)

Le propriétaire ne saisit plus le loyer : il décrit le logement (commune, adresse, type, surface, pièces, chambres, capacité, état, aménagement, mobilier, literie, équipements, étage et ascenseur, luminosité, extérieur, stationnement, calme). Il garde la main sur le **forfait de charges** et peut **modifier le loyer conseillé** (champ facultatif, signalé comme modification personnelle dans les résultats, le résumé et l'e-mail).

| Élément | Fichier |
|---|---|
| Coefficients, sources, plafonds, confiance | `config/mobilite-loyer.json` (+ `schemas/mobilite-loyer.schema.json`) — chaque valeur porte sa nature : SOURCE, LECTURE ou HYPOTHÈSE |
| Calcul | `estimerLoyerMobilite()` dans `engine/mobilite.js` ; `estimerMobilite(raw, cfg, reperes, cfgLoyer)` l'utilise si `raw.logement` est fourni (sinon contrat 1.0.0 : `raw.loyer` saisi) |
| Tests | `tests/mobilite-loyer.test.mjs` (15) |

Méthode :

1. Base : loyer d'annonce au m² de la location **nue**, charges comprises, de la commune et de la catégorie (Carte des loyers 2025 : appartements 1-2 pièces, 3 pièces et plus, maisons) — `data/mobilite/reperes-loyers.json`.
2. × (1 + écart meublé / nu) : étude ANIL du 28/10/2026 (environ 10 % en moyenne nationale ; carte 9 par unité urbaine, en classes, sans valeur chiffrée publiée). Les 10 communes desservies de l'unité urbaine INSEE de Rennes (35701 : Rennes, Betton, Bruz, Cesson-Sévigné, Chantepie, Chartres-de-Bretagne, Pacé, Saint-Grégoire, Saint-Jacques-de-la-Lande, Vezin-le-Coquet) : 10 % (borne basse de la classe « 10 à 12,5 % ») ; Saint-Malo, Vitré (lecture incertaine), Châteaubourg, Liffré, Saint-Aubin-du-Cormier et Val-d'Izé (aucune mesure identifiable ou hors unité urbaine) : 8,5 %, valeur prudente. **Lecture visuelle d'une carte en classes, à confirmer auprès de l'ANIL.** L'écart est mesuré hors charges et appliqué à une base charges comprises (effet de quelques euros, sous l'arrondi).
3. × (1 + écart bail mobilité / meublé classique) = 0 % : aucune donnée (l'ANIL indique que les baux mobilité ne peuvent pas être isolés).
4. × (1 + critères) : ajustements HYPOTHÈSES Émeraude (− 5 % à + 5 % par critère, ≤ 2 % par équipement), additionnés et plafonnés à ± 12 %. Chambres, capacité et adresse : 0 % (justifié dans la configuration). Équipements obligatoires du meublé (décret n° 2015-981) : aucune décote, mais signalés et confiance faible s'ils manquent.
5. Loyer total conseillé = prix au m² × surface (arrondi à 10 €). **Loyer conseillé hors charges = loyer total − forfait choisi par le propriétaire** : un forfait plus élevé réduit d'autant le loyer hors charges ; il n'augmente jamais le revenu.
6. Fourchette : intervalle de prédiction à 95 % de la Carte des loyers ramené à 50 % (confiance moyenne) ou 80 % (confiance faible), erreur supposée log-normale.
7. Confiance « moyenne » au mieux (jamais « élevée ») ; « faible » si fiabilité communale faible, moins de 100 annonces, surface atypique pour la catégorie, maison, ou équipements minimaux non cochés.

Contrôle (non utilisé dans le calcul) : OLL d'Ille-et-Vilaine 2025, loyers hors charges du parc loué vide de l'agglomération de Rennes (1 pièce 17,0 €/m², 2 pièces 12,8, 3 pièces 10,8, 4 et plus 9,9 ; emménagés récents 12,6). La Carte des loyers mesure des loyers **d'annonce**, en général supérieurs aux loyers signés observés par l'OLL : le loyer conseillé est un prix de mise en location, pas un loyer garanti.

L'actualisation automatique (`data-refresh.yml`) ne lit ni n'écrit les fichiers du parcours bail mobilité ; elle régénère l'artifact complet (les deux parcours) lorsqu'une nouvelle période de données courte durée est activée.

## Sources de données

| Source | Usage | Mise à jour | Collecte | Licence |
|---|---|---|---|---|
| Ille & Vilaine Tourisme (données Lighthouse), bilan « Fréquentation des hébergements locatifs » | Base de marché par intercommunalité (prix moyen par nuit, occupation, séjour moyen, nuits réservées) et profil mensuel départemental | Annuelle (vers avril) | Manuelle : `data/raw/adt35/*.csv` | Non précisée : citation de chiffres agrégés avec mention de la source |
| Eurostat (`tour_ce_oarc`, `tour_ce_omn12`) | Contrôles de cohérence (durée de séjour à Rennes, mois de pointe) | Trimestrielle / annuelle | Automatique (sans clé) | Réutilisation libre avec mention de la source |
| Insee Melodi (`DS_TOUR_FREQ`, hôtels, Ille-et-Vilaine) | Profil saisonnier urbain (approximation) | Mensuelle | Automatique (sans clé) | Licence Ouverte Etalab 2.0 |
| Données Émeraude (agrégats) | Calibration progressive | Au choix | Manuelle, en local | Interne : seuls des agrégats ≥ 3 logements sont publiés |

Crédit obligatoire (outil, impression, e-mail) : **« Sources : Ille & Vilaine Tourisme (données Lighthouse), Eurostat, Insee. »**

Définitions **non déterminées** par la source principale (affichées dans la méthodologie, sans aucune correction) : inclusion des frais de ménage dans le prix moyen par nuit ; prise en compte des nuits bloquées dans le taux d'occupation.

## Commandes

```bash
npm run data:update                 # actualisation contrôlée (récupération → contrôles → préparation → tests → activation)
npm run data:update -- --dry-run    # simulation : décision ACCEPT / REVIEW / REJECT, aucune donnée active modifiée
npm run data:integrate              # après une saisie annuelle (data/raw/...) : reconstruction contrôlée sans téléchargement
npm run data:restore -- --list      # versions archivées de market.json (restauration : voir docs/procedure-donnees-annuelles.md)
npm run security                    # contrôle : aucun secret, aucune donnée privée, aucun PDF publiable
npm run build:artifact              # estimateur officiel (artifact Claude) → dist/estimateur-artifact.html, à republier après chaque version validée
npm run fetch        # (compatibilité) = simulation de l'actualisation
npm run build        # reconstruction directe SANS contrôle de variation (développement uniquement ; préférer data:integrate)
npm test             # tests automatiques (moteur, pipeline, parité ancien moteur, invariants, automatisation)
npm run compare      # rapport ancien / nouveau moteur → reports/
npm run freshness    # fraîcheur des données
npm run emeraude:aggregate   # en local uniquement : agrégats anonymisés des logements gérés
```

Node.js 20 ou plus, aucune dépendance à installer.

## Procédure annuelle (≈ 15 minutes, vers avril)

1. Télécharger le nouveau bilan « Fréquentation des hébergements locatifs » sur le site d'Ille & Vilaine Tourisme.
2. Créer `data/raw/adt35/epci_AAAA.csv` et `data/raw/adt35/departement_mensuel_AAAA.csv` en recopiant les tableaux (même format que 2024). Les anciens fichiers restent : l'historique est conservé.
3. Lancer `npm run data:integrate -- --dry-run` (simulation), puis `npm run data:integrate`. Une variation anormale (prix > 30 %, occupation > 15 pts, revenu des logements de référence > 30 %) bloque l'activation ; une variation notable (prix > 10 %, occupation > 5 pts, revenu > 10 %) est activée mais signalée (REVIEW). Détail : `docs/procedure-donnees-annuelles.md` et `reports/automation-data-refresh-2026-10.md`.

## Automatisation (GitHub Actions, gratuit)

Workflow `.github/workflows/data-refresh.yml` : chaque lundi + lancement manuel. Connexion du dépôt : voir `reports/automation-data-refresh-2026-10.md` → « Instructions pour moi ». Aucune clé secrète n'est nécessaire : toutes les sources sont publiques.

## Ajouter une source (ex. API payante) sans toucher au moteur ni à Framer

1. `scripts/adapters/<source>.mjs` : convertir les réponses en observations normalisées (`schemas/observation.schema.json`), avec `segment.bedrooms` si la source est segmentée.
2. `config/sources.json` : déclarer la source (priorité, licence, crédit, définitions).
3. `scripts/build-market.mjs` : la source est retenue selon sa priorité ; si elle est segmentée par chambres, `segmentedBy: ["bedrooms"]` neutralise automatiquement le facteur chambres du modèle (test 22).
4. Une clé éventuelle va dans les *secrets* GitHub Actions, jamais dans l'Embed. Si les conditions de la source interdisent de publier ses données, prévoir un proxy (hors V1).

## Arborescence

```
config/          config.json (coefficients), communes.json, sources.json
schemas/         schémas JSON (config, communes, sources, observation, market)
data/raw/        données sources (manuelles et automatiques)
data/observations/  observations normalisées + rapport de validation
data/history/    updates.jsonl (une ligne par construction)
data/emeraude/   aggregates.json (publié) ; private/ (jamais publié)
engine/          moteur de calcul (fonctions pures)
legacy/          sauvegarde exacte de l'Embed v1 + réplique de son calcul
embed/           template.html → estimateur-v2.html (future version définitive, sans badge ni noindex)
deploy/estimateur-v2/  estimateur-v2-validation.html (page de validation /estimateur-v2 : badge + noindex) et CHECKLIST.md (étapes Framer prévues, non exécutées)
dist/            market.json, config.json, preview.html, compare.html, freshness.json
reports/         rapport de comparaison ancien / nouveau
tests/           tests automatiques (node --test)
```

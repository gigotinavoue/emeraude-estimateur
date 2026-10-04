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

# Automatisation de l'actualisation des données — octobre 2026

*Réalisée les 4 et 5 octobre 2026.*
- Moteur 1.2.0 non modifié (empreintes vérifiées, test DR14). Coefficients, courbe des chambres, scénarios et logique financière intacts.
- Framer non touché. Rien n'a été publié : ni dépôt GitHub, ni émulateur republié.
- **Tests : 130 / 130 réussis** (109 existants, dont 3 rendus indépendants du millésime, + 21 nouveaux).

## Audit de l'existant (avant modification)

| Élément | Constat |
|---|---|
| `npm run data:update` | Enchaînait `fetch-public` → `build` → `npm test`. **Défaut : les données actives étaient écrasées avant les tests.** Pas de comparaison avec la version active, pas de contrôle des 8 références, pas de simulation. |
| `npm run update` | Alias de `data:update`. |
| `npm run build` | Reconstruction complète directe (normalisation, validation, marché, historique, fraîcheur, émulateur). Aucun contrôle de variation sur le revenu. |
| `npm run freshness` | Fraîcheur par marché et par famille. Sortie GitHub `needs_attention`. |
| `fetch-public.mjs` | Eurostat et Insee sans clé, 3 essais, refus d'une période en recul, archivage par période. **Pas** de contrôle des bornes, du volume ni des révisions ; écriture directe des fichiers actifs. |
| `build-market.mjs` | Validation par schéma ; `validate.mjs` conserve la valeur précédente si le prix varie de plus de 30 % ou l'occupation de plus de 15 pts (EPCI). |
| `history-market.mjs` | Historique `data/market/<année>/`, archivage horodaté. |
| Eurostat / Insee | Automatisables (API publiques, sans clé). Seul l'Insee entre dans le calcul (forme de la saisonnalité urbaine, PROXY). Eurostat sert de contrôle. |
| Publications annuelles | Aucune détection automatique. |
| GitHub Actions | `.github/workflows/update-data.yml` et `tests.yml` **préparés en phase 0-3 mais jamais exécutés** : Git n'est pas installé, il n'y a pas de dépôt GitHub. L'ancien workflow écrasait les données sans contrôle, publiait l'outil sur GitHub Pages et ne détectait pas les publications. |
| Tests | Plusieurs tests figeaient l'état d'octobre 2026 (« la base est 2024 », « références = instantané »). **Ils auraient bloqué à tort toute actualisation légitime.** |

**A. Réellement automatique avant ce chantier :** rien en pratique, faute de planificateur actif. Les scripts existaient, mais il fallait lancer une commande.

**B. Manuel :** tout le reste, c'est-à-dire le lancement, la lecture des PDF annuels et la décision d'intégration.

**C. Exécutable sans intervention :** récupération Eurostat / Insee, reconstruction, tests, fraîcheur.

**D. Validation humaine nécessaire :** publications annuelles (base par EPCI), séries révisées, variations anormales.

## Architecture finale

```
lundi 5 h 23 UTC (GitHub Actions) ou `npm run data:update`
 │
 ├─ 0. contrôle de sécurité ─────────────── échec → ERROR, rien n'est activé
 ├─ 1. sources automatiques (Eurostat ×2, Insee)
 │     récupérer → contrôler la réponse → comparer à la version active
 │     UNCHANGED | NEW_PERIOD | REVISION | UNAVAILABLE | REJECTED
 ├─ 2. pages de publications annuelles ──── nouveau PDF → « NOUVELLE PUBLICATION À VÉRIFIER » (jamais intégré)
 ├─ 3. rien de nouveau et aucune saisie manuelle ? → ARRÊT : aucune reconstruction, aucune écriture
 ├─ 4. zone de préparation (copie du dépôt sans données privées)
 │     intégration → normalisation → validation → marché → historique → fraîcheur → émulateur
 ├─ 5. comparaisons : marchés, profils saisonniers, 8 logements de référence → ACCEPT / REVIEW / REJECT
 ├─ 6. tests complets (130) dans la zone de préparation
 ├─ 7. ACCEPT ou REVIEW : archivage de la version active puis activation
 │     REJECT : version active conservée
 └─ 8. rapport (out/refresh-report.md|json) + alerte uniquement si une intervention est nécessaire
```

| Nouveau fichier | Rôle |
|---|---|
| `scripts/refresh.mjs` | Orchestrateur (`data:update`, `--dry-run`, `--no-fetch`, `--force`, `--force-accept`) |
| `scripts/lib/refresh-core.mjs` | Contrôles et seuils (fonctions pures) |
| `scripts/lib/fetch-sources.mjs` | Accès aux API (sans écriture) |
| `scripts/detect-publications.mjs` | Surveillance des publications annuelles |
| `scripts/security-check.mjs` | Secrets, données privées, PDF |
| `scripts/restore-market.mjs` | Liste et restauration des versions |
| `scripts/ci/alert-issue.mjs` | Alerte GitHub (une seule issue, sans relance identique) |
| `config/automation.json` | Sources, seuils, alertes, pages surveillées |
| `.github/workflows/data-refresh.yml` | Workflow planifié et manuel |
| `scripts/windows/planifier-actualisation.ps1` | Repli sans GitHub (préparé, **non installé**) |
| `tests/automation.test.mjs` | 21 tests (API simulée, copie temporaire du dépôt) |

`fetch-public.mjs` lance désormais une simulation : plus aucune écriture directe des données actives. L'ancien `update-data.yml` est archivé dans `docs/archive/update-data.yml.ancien` pour éviter deux planifications concurrentes.

## Sources automatiques

| Source | Rôle | Dernière période au 05/10/2026 | Publication | Alerte « source figée » si retard > |
|---|---|---|---|---|
| Insee `DS_TOUR_FREQ` (occupation des hôtels, Ille-et-Vilaine) | calcul : forme de la saisonnalité urbaine (PROXY) | 2026-07 | mensuelle, environ M+2 | 5 mois |
| Eurostat `tour_ce_omn12` (Bretagne, mensuel) | contrôle du mois de pointe | 2026-03 | mensuelle, environ M+6, irrégulière | 11 mois |
| Eurostat `tour_ce_oarc` (Rennes, annuel) | contrôle de la durée de séjour et de la tendance | 2025 | annuelle, mise à jour trimestrielle | 22 mois |

Aucune clé, aucun compte, aucun abonnement.

**Effet réel sur les estimations :** une nouvelle année Insee **complète** modifie le profil urbain. Cela arrivera vers février-mars 2027 pour l'année 2026. Les mois isolés n'ont aucun effet, et Eurostat n'en a jamais : il ne sert qu'au contrôle.

## Sources manuelles

| Publication | Rôle | Parution | Traitement |
|---|---|---|---|
| Ille & Vilaine Tourisme — bilan des hébergements locatifs | **seule source pouvant faire évoluer la base de calcul** (prix, occupation, durée par EPCI) | annuelle, vers avril | détectée automatiquement → validation humaine → `data:integrate` |
| Ille & Vilaine Tourisme — Chiffres clés | indicateurs départementaux (contrôle) | annuelle, mai-juin | détectée → validation humaine |
| AUDIAR — Observatoire du tourisme de Rennes Métropole | tendance de l'offre et de la demande | annuelle, juillet | détectée → validation humaine |

## Fréquence

**Hebdomadaire, le lundi à 5 h 23 UTC, plus lancement manuel.** Ce choix est retenu plutôt qu'un rythme mensuel :
- le délai d'intégration d'une nouvelle période Insee passe de 30 jours au plus à 7 jours au plus ;
- une panne de source est détectée en 3 semaines au lieu de 3 mois ;
- une nouvelle publication annuelle est signalée dans la semaine ;
- le coût est négligeable : environ 1 minute par exécution, gratuite.

**Les exécutions sans nouveauté ne reconstruisent rien, n'écrivent rien, ne créent aucun commit et n'envoient aucune alerte.** Un rythme quotidien serait inutile : aucune source ne publie plus souvent qu'une fois par mois.

## Workflow

`.github/workflows/data-refresh.yml` :
- **Déclenchement :** planifié (`23 5 * * 1`) et manuel, avec les options « Simulation » et « Reconstruire ».
- **Permissions :** `contents: write` (enregistrer les données) et `issues: write` (alerte). Seul le jeton automatique du workflow est utilisé : **aucun secret à créer**.
- **Étapes :**
  1. vérification de l'absence de dépendance (le projet n'en a aucune) ;
  2. contrôle de sécurité ;
  3. actualisation contrôlée ;
  4. tests sur la version active ;
  5. artefact « refresh-report » conservé 90 jours ;
  6. commit **uniquement s'il y a un changement**, après un nouveau contrôle de sécurité ;
  7. alerte **uniquement s'il y en a une** ;
  8. **échec propre** (job rouge + message) si l'activation est bloquée ou en erreur, la version active restant en place.
- Concurrence verrouillée : deux exécutions ne peuvent pas se chevaucher.
- `tests.yml` : sécurité + 130 tests à chaque envoi (Node 24).

## Contrôles

**Réponse d'une source.** Une réponse est refusée (version précédente conservée, alerte) si l'un de ces contrôles échoue :
- réponse vide ou illisible ;
- période absente, invalide ou postérieure à la date du jour ;
- **dernière période antérieure à la version active** ;
- moins d'observations que le minimum (24 mois pour l'Insee et Eurostat Bretagne, 6 pour Rennes) ;
- valeur hors bornes (occupation hôtelière entre 5 % et 100 %, nuitées positives) ;
- plus de 10 % des observations déjà connues absentes (réponse tronquée) ;
- révision massive des périodes déjà publiées.

**Marché candidat.** Il est rejeté si :
- il est vide ;
- un marché ou un profil a disparu ;
- une valeur sort des bornes de `config.validation` ;
- les seuils de variation sont dépassés (voir ci-dessous).

**Tests :** les 130 tests sont exécutés sur le candidat (moteur, pipeline, données, automatisation). Un seul échec bloque l'activation. Le test de bout en bout l'a montré : un test défaillant a bien bloqué la nouvelle version.

**Références :** les 8 logements sont recalculés avec la version active et le candidat, à la même date. Seules les données changent.

## Seuils de variation

| Grandeur | Accepté | REVIEW (activé + `NEEDS_REVIEW=true` + alerte) | REJECT (activation bloquée) |
|---|---|---|---|
| Prix moyen d'un marché (EPCI) | ≤ 10 % | > 10 % | > 30 % ou hors [30 ; 400 €] |
| Occupation d'un marché | ≤ 5 pts | > 5 pts | > 15 pts ou hors [10 ; 90 %] |
| Durée moyenne de séjour | ≤ 15 % | > 15 % | > 35 % ou hors [1 ; 15 nuits] |
| Indice saisonnier mensuel | ≤ 0,15 | > 0,15 | > 0,5 |
| Revenu (CA des nuits) d'un logement de référence | ≤ 10 % (signalé dès 3 %) | > 10 % | > 30 % ou estimation hors [3 000 ; 80 000 €] |
| Prix par nuit d'un logement de référence | ≤ 10 % (signalé dès 3 %) | > 10 % | > 30 % |
| Occupation d'un logement de référence | ≤ 5 pts (signalé dès 2 pts) | > 5 pts | > 15 pts |
| Révision Insee des mois déjà publiés | ≤ 10 pts | > 10 pts | > 25 pts |
| Révision Eurostat des périodes déjà publiées | ≤ 20 % | > 20 % | > 50 % |
| Changement de millésime de la base (ex. 2024 → 2025) | — | toujours REVIEW | — |

**Justification des seuils** : ils sont calibrés sur les mouvements réels observés.
- Entre 2023 et 2024, le prix départemental a varié de +8,3 % : accepté.
- L'occupation de Rennes Métropole a baissé de 5 pts (accepté) et celle de Vitré Communauté de 7 pts : REVIEW, donc activé mais signalé.
- La révision du TJM Lighthouse (+35 %) aurait été bloquée : à juste titre, c'était une rupture de série.
- Le seuil de 30 % sur le prix reprend la règle déjà en place dans `validate.mjs`.

Ces règles sont vérifiées par le test A7 :

| Exemple (Rennes T2) | Résultat |
|---|---|
| 10 427 € → 10 886 € (+4,4 %) | **accepté et signalé** |
| +12 % | **REVIEW** |
| 10 427 € → 145 000 € | **REJECT** |

Les seuils sont modifiables dans `config/automation.json` ; cela ne touche pas au moteur.

## Fallback

| Situation | Comportement |
|---|---|
| Source indisponible | Version précédente conservée, statut WARNING (« aucune donnée perdue »), alerte au 3e échec consécutif. |
| Réponse invalide | Refusée, version précédente conservée, alerte immédiate. |
| Candidat anormal ou tests en échec | Activation bloquée (BLOCKED), version active conservée, alerte, job en échec. |
| Erreur inattendue du pipeline | Statut ERROR, rien n'est activé. |
| Côté estimateur (inchangé, moteur 1.2.0) | Repli EPCI → marché voisin → département → dernière version validée → données intégrées, chacun abaissant la confiance. Tests 17 à 20 et P6. |

**Une API défaillante ne peut jamais produire un `market.json` vide ou incohérent actif** : le candidat est construit à part et n'est activé qu'après tous les contrôles.

## Historique

Rien n'est jamais supprimé :

| Élément | Emplacement |
|---|---|
| Versions brutes Eurostat / Insee | `data/raw/<source>/archive/<fichier>.<période>.json`, à chaque nouvelle période ; les révisions sont archivées avec horodatage |
| Versions complètes de `market.json` | `data/history/market-versions/market-<horodatage>.json`, avant chaque activation. Exemple présent : version du 04/10/2026 21 h 44 |
| Références acceptées des 8 logements | `data/history/reference-accepted.json` + `data/history/reference-versions/` |
| Millésimes | `data/market/2024/`, `data/market/2025/`, puis `2026/` à venir |
| Rapports | `data/history/refresh-reports/` (à chaque activation ou alerte) et artefacts GitHub (90 jours) |
| Journal | `data/history/updates.jsonl` |
| État des sources | `data/history/source-health.json` (échecs consécutifs ; écrit seulement s'il change) |

Avec Git, chaque activation devient aussi un commit : l'état exact du dépôt à n'importe quelle date est reconstructible. En local : `npm run data:restore -- --list`, puis `node scripts/restore-market.mjs <version>`. La version active est archivée avant restauration (test A16).

## Alertes

Une seule issue GitHub, « Données : intervention nécessaire », reçue par e-mail via les notifications GitHub. Un commentaire n'est ajouté que si l'alerte change.

Cas qui déclenchent une alerte :
- source indisponible 3 exécutions de suite ;
- réponse invalide ;
- variation REVIEW ou REJECT ;
- tests en échec ;
- **nouvelle publication annuelle** ;
- source figée (retard anormal) ;
- page de publication inaccessible 3 fois ;
- fraîcheur LOW ;
- échec du contrôle de sécurité ;
- pipeline bloqué.

**Aucune alerte quand tout se passe normalement**, ni pour une simple nouvelle période acceptée. Le job lui-même échoue (e-mail GitHub standard) en cas de blocage ou d'erreur.

## Sécurité

- **`npm run security`**, exécuté avant l'actualisation, avant chaque commit et à chaque envoi. Il bloque :
  - les jetons GitHub, clés AWS ou Google, clés privées, jetons Bearer ou Slack ;
  - les mots de passe et clés écrits en clair ;
  - les fichiers `.env` ;
  - les données Émeraude brutes ;
  - les données brutes Inside Airbnb ;
  - **tout PDF publiable** (licences de redistribution non établies) ;
  - un `.gitignore` qui n'exclurait plus `data/emeraude/private/`.
- Examen du 05/10/2026 : **144 fichiers publiables, aucun problème.** Les seules adresses e-mail du dépôt sont `proprietaire@exemple.fr` (exemple) et l'adresse « noreply » du robot GitHub.
- **Données Émeraude :**
  - la zone de préparation **ne copie jamais** `data/emeraude/private/` ;
  - le workflow n'appelle jamais `emeraude:aggregate` ;
  - aucune recalibration automatique et aucune écriture de la configuration (tests A20, A21).
- **Logs et rapports :** ils ne contiennent ni secret (test A18) ni donnée brute. Le jeton GitHub n'est jamais affiché.
- **PDF détectés :** conservés en local dans `data/inbox/pdf/` (exclu de Git). Seuls l'adresse, l'empreinte et la taille sont enregistrées.

## Procédure annuelle

1. Une alerte « ⚠️ NOUVELLE PUBLICATION À VÉRIFIER » arrive (issue GitHub, ou `out/refresh-report.md`).
2. Lire le PDF (lien dans l'alerte) et classer chaque variable en A / B / C / D, comme en octobre 2026.
3. Si des données comparables par EPCI existent (A), saisir `data/raw/adt35/epci_AAAA.csv` et `departement_mensuel_AAAA.csv`, puis compléter `data/raw/manifest.json`. Les anciens fichiers restent.
4. `npm run data:integrate -- --dry-run` : lire les variations et l'impact sur les 8 logements.
5. `npm run data:integrate` : activation si ACCEPT ou REVIEW ; blocage si REJECT. Dans ce cas, comprendre l'écart ; si l'écart est justifié, `node scripts/refresh.mjs --no-fetch --force-accept` (décision humaine uniquement).
6. Ajouter l'adresse du PDF à `config/automation.json → publications.known` : l'alerte s'arrête.

Détail : `docs/procedure-donnees-annuelles.md`.

## Procédure en cas d'échec

| Situation | Que faire |
|---|---|
| Source indisponible | Rien : la version précédente est conservée. Au-delà de 3 semaines, vérifier sur le site de la source si l'API a changé. |
| Réponse refusée / variation anormale | Lire l'artefact `refresh-report` ou `out/refresh-report.md`. Si c'est une erreur de la source : rien à faire, la semaine suivante réessaie. Si c'est une rupture réelle : validation humaine (`--force-accept`) après analyse. |
| Tests en échec | Rien n'a été activé. Corriger la cause, puis relancer avec « Run workflow ». |
| Mauvaise version activée malgré tout | `npm run data:restore -- --list`, puis `node scripts/restore-market.mjs <version>` et `node scripts/build-embed.mjs && npm test`. |

## Ce qui reste manuel

- Une fois, la connexion du dépôt à GitHub (voir ci-dessous).
- Une fois par an environ, la validation et la saisie de la publication annuelle par EPCI, la seule qui fasse évoluer la base. Les Chiffres clés et l'AUDIAR demandent seulement une lecture de contrôle.
- **L'émulateur Claude ne se met pas à jour tout seul.** La page privée sur claude.ai ne peut pas lire de données hébergées ailleurs (règle de sécurité des artefacts). Elle affiche les données intégrées lors de sa dernière publication, avec leur âge et leur fraîcheur, donc sans tromper. Concrètement :
  - les mises à jour mensuelles automatiques ne changent presque rien aux estimations, puisque la base reste annuelle et que l'Insee ne modifie le profil qu'une fois par an ;
  - **il suffit de republier l'émulateur une fois par an**, juste après l'intégration annuelle ;
  - option : activer GitHub Pages pour disposer d'une copie de l'émulateur (`dist/preview.html`) toujours à jour. Elle serait **publique** (avec noindex) ; c'est à vous de décider.

## Ce qui est totalement automatique (une fois le dépôt connecté)

- La récupération hebdomadaire Eurostat et Insee, avec ses contrôles.
- L'intégration des nouvelles périodes, la reconstruction, les tests, l'archivage et l'activation.
- La conservation de l'ancienne version en cas de problème.
- La détection des nouvelles publications annuelles.
- Le calcul de la fraîcheur et l'alerte LOW (à partir d'avril 2027 si aucun bilan 2025 n'est intégré).
- Le rapport de chaque exécution et les alertes, uniquement quand elles sont nécessaires.

**Aujourd'hui, rien ne tourne encore** : Git n'est pas installé et le dépôt n'existe pas sur GitHub. Les fichiers sont prêts ; je n'ai rien publié.

## Vérifications finales (05/10/2026)

| Vérification | Résultat |
|---|---|
| Toutes les suites de tests | **130 / 130**, 0 échec |
| Intégrité du moteur | empreintes identiques (DR14) |
| 8 logements de référence | strictement identiques à octobre 2026 (Rennes T2 10 427 € → 10 400 €, [9 700 – 11 200 €], MOYENNE) |
| Fallback | tests 17 à 20, P6, A11, A12 |
| Historique | DR10, A10, A16 ; versions présentes dans `data/history/` |
| Simulation (dry-run réel, API réelles) | 3 sources interrogées, aucune nouvelle période, statut OK, `dist/market.json` inchangé |
| Bout en bout sur une copie (nouvelle période Insee simulée) | ACCEPT, 130/130 en préparation, archive créée, version activée, dépôt réel intact |
| Workflow GitHub Actions | structure vérifiée (A20) ; **non exécuté** (aucun dépôt connecté) |
| Données privées | aucune exposée (contrôle de sécurité OK, A17, A21) |
| Anciennes données récupérables | oui (archives brutes, versions de marché, références, millésimes) |

**Incident à signaler.** Pendant les essais, une exécution forcée (`--force --no-fetch`) est partie par erreur sur le dépôt réel au lieu d'une copie. Elle a suivi le processus normal :
- reconstruction ;
- 130/130 tests ;
- 0 % de variation sur les 8 logements ;
- archivage de la version précédente ;
- activation.

Les valeurs de marché sont identiques (0 écart). Seuls les horodatages ont changé : `dist/market.json` est daté du 04/10/2026 22 h 09, la version précédente est archivée et la référence acceptée initiale est conservée dans `reference-versions/`. Aucune donnée n'a été perdue, rien n'a été publié.

## Instructions pour moi

**Pour les données mensuelles : rien.**

**Une seule fois, pour que tout tourne seul (environ 15 minutes, gratuit) :**
1. Installer **GitHub Desktop** (https://desktop.github.com) et vous connecter à votre compte GitHub (en créer un si besoin).
2. *File → Add local repository* → choisir `C:\Users\keres\emeraude-estimateur` → accepter de « créer un dépôt ».
3. *Publish repository*. Pour le choix public ou privé :
   - **Public** : GitHub Actions est illimité et gratuit, et la décision D5 (« données publiques et coefficients publics ») est respectée. Les données Émeraude sont exclues et vérifiées.
   - **Privé** : gratuit aussi jusqu'à 2 000 minutes par mois, ce qui est largement suffisant (environ 10 minutes par mois utilisées).
4. Sur github.com, ouvrir le dépôt → onglet **Actions** → activer les workflows si demandé → « Actualisation des données » → **Run workflow**. La 1re exécution doit être verte, avec le statut OK.
5. Vérifier que les notifications GitHub arrivent bien par e-mail : *Settings → Notifications*.

**Ensuite, une fois par an**, quand vous recevez l'e-mail « Données : intervention nécessaire — ⚠️ NOUVELLE PUBLICATION À VÉRIFIER » :
1. Ouvrir le PDF signalé et le rapport.
2. Valider avec moi les nouvelles données : on les classe A / B / C / D, comme cette fois.
3. Lancer l'intégration (`npm run data:integrate -- --dry-run`, puis `npm run data:integrate`) et republier l'émulateur.

**Si vous recevez une autre alerte** (variation anormale, source en panne depuis 3 semaines, fraîcheur LOW) : rien n'a été cassé, l'ancienne version est toujours active. Ouvrez le rapport joint et demandez-moi de l'analyser.

**Sans GitHub** (repli possible) : `powershell -ExecutionPolicy Bypass -File scripts\windows\planifier-actualisation.ps1` crée une tâche Windows chaque lundi. Elle ne tourne que si le PC est allumé, et le rapport se lit dans `out\refresh-report.md`.

**À savoir** : GitHub suspend les tâches planifiées d'un dépôt public sans activité pendant 60 jours. Les commits automatiques des nouvelles périodes Insee (mensuelles) maintiennent le dépôt actif. Si GitHub envoie malgré tout un avertissement, un clic sur « Enable workflow » suffit.

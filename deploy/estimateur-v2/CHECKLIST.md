# Préparation de /estimateur-v2 (page de validation) — NON EXÉCUTÉ

Rien de ce qui suit n'a été fait dans Framer. Ce fichier décrit la prochaine étape, à réaliser **uniquement après la revue finale et votre accord explicite**.

## Fichier à utiliser

`deploy/estimateur-v2/estimateur-v2-validation.html`, généré par `npm run build:embed`. Il contient :
- moteur 1.2.0 avec fourchette d'incertitude, niveau de confiance et raisons ;
- badge « V2 · VERSION DE VALIDATION » ;
- ajout automatique de `<meta name="robots" content="noindex, nofollow">` (garde-fou supplémentaire) ;
- données de marché et configuration intégrées (secours) ; lecture en ligne de `market.json` / `config.json` si `ESTIMATEUR_DATA_BASE_URL` est défini au moment de la génération.

`embed/estimateur-v2.html` est la future version définitive : sans badge, sans noindex. Elle n'est pas destinée à la page de validation.

## Étapes prévues dans Framer (plus tard)

1. Créer une **nouvelle page** `/estimateur-v2`, sans dupliquer ni modifier `/estimateur`.
2. Réglages de la page : **noindex** activé, exclue du sitemap, aucun lien depuis le menu, le pied de page ou d'autres pages.
3. Ajouter un composant Embed (HTML) contenant `estimateur-v2-validation.html`. Hauteur : **automatique / ajustée au contenu** (pas 502 px fixes), sur Desktop et Phone.
4. Publier, puis vérifier :
   - la page renvoie `noindex` (en-tête HTML) et n'apparaît pas dans `sitemap.xml` ;
   - `/estimateur` est **inchangé** (comparer avec `legacy/embed-v1-backup.html`, empreinte dans `legacy/embed-v1-meta.json`) ;
   - affichage sur ordinateur et mobile (390 px), impression, e-mail.
5. Tester en conditions réelles pendant la période de validation, sans utiliser la V2 comme estimateur principal.

## Retour arrière

Supprimer la page `/estimateur-v2`. `/estimateur` n'ayant pas été touché, aucune autre action n'est nécessaire.

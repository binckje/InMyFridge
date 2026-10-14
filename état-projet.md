# InMyFridge — État du projet

_Dernière mise à jour : 2026-10-14_

## Statut

Phase : **cadrage / spécifications**. Aucun code. Seul ce fichier évolue pour l'instant.

## Objectif

Application de gestion en temps réel de ce qui est stocké à la maison (frigo, congélateur, épiceries, produits ménagers), avec suggestions de recettes selon le stock.

## 1. Organisation du stockage

Structure **configurable** (emplacements et catégories modifiables, ajout/suppression/renommage).

| # | Emplacement | Sous-catégories |
|---|-------------|-----------------|
| 1 | Réfrigérateur | A Viandes / poissons · B Crémerie · C Fruits et légumes · D Liquides · E Restes · F Laiterie / dessert / épicerie salée, sucrée · G Autre |
| 2 | Congélateur | Mêmes sous-catégories que le réfrigérateur |
| 3 | Épicerie sèche salée | — |
| 4 | Épicerie sèche sucrée | — |
| 5 | Autres | — |
| 6 | Produits ménagers | — |

## 2. Quantités

- **Solides** : unité de masse (g, kg) ou nombre de pièces.
- **Liquides** : unité de volume (ml, cl, l).
- **Difficile à évaluer** : niveau qualitatif dans une liste : `plus` · `moyen` · `suffisamment` · `beaucoup`.
- **Seuil d'alerte** par denrée (valeur numérique ou niveau qualitatif) → notification / liste de courses quand le stock passe sous le seuil.

## 3. Ajout de denrées

1. Saisie manuelle.
2. Photo de l'emballage + OCR (prise par téléphone ou depuis un fichier image).
3. Scan de code-barres (caméra).
4. Saisie manuelle du code-barres.

## 4. Recettes

- **Stock → recettes** : proposer les recettes faisables avec le stock.
  - Priorité : recettes stockées localement, puis recherche internet.
  - Si pas de correspondance à 100 % : afficher les ingrédients manquants.
- **Recette → stock** : choisir une recette (mêmes sources) → faisable ou non + liste de ce qui manque.
- Notation des recettes.
- Enregistrement d'une recette trouvée sur internet dans la base locale.

## 5. Stockage et synchronisation

- Données stockées sur chaque appareil (fonctionnement hors ligne).
- Synchronisation via **Nextcloud** (phase 1).
- Plus tard : synchronisation via **NAS**.

## 6. Plateformes cibles

- Phase 1 : **Linux** et **iOS** (pas de compte Apple Developer pour l'instant).
- Plus tard : Windows, Android.

## Questions ouvertes

- [ ] Choix technique (framework multiplateforme) compatible Linux + iOS sans compte Apple Developer.
- [ ] Mode d'installation iOS sans compte développeur (PWA ? sideload ?).
- [ ] Format de synchro Nextcloud (WebDAV + fichier JSON/SQLite ? gestion des conflits multi-appareils).
- [ ] Source de données code-barres (ex. Open Food Facts).
- [ ] Moteur OCR (local ou service en ligne).
- [ ] Source(s) de recettes internet.
- [ ] Ordre exact des niveaux qualitatifs (« plus » = presque plus ?).
- [ ] Gestion des dates de péremption ? (non demandé pour l'instant)
- [ ] Multi-utilisateurs / foyer partagé ?

## Journal des décisions

| Date | Décision |
|------|----------|
| 2026-10-14 | Création du fichier, cahier des charges initial. |

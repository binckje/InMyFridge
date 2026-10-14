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
- **Difficile à évaluer** : niveau qualitatif sur 3 niveaux : `plus beaucoup` · `moyen` · `suffisamment`.
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
- Synchronisation via **Google Drive** (phase 1), dans le dossier caché propre à l'app (`appDataFolder`).
- Nextcloud mis de côté (hébergeur TabDigital bloque CORS, voir historique).
- Plus tard : synchronisation via **NAS**.
- Synchro écrite derrière une interface commune (adaptateurs) pour changer de fournisseur sans tout réécrire.

## 6. Plateformes cibles

- Phase 1 : **Linux** et **iOS** (pas de compte Apple Developer pour l'instant).
- Format : **PWA** (application web installable) — installation sur appareils Apple via Safari « Ajouter à l'écran d'accueil ».
- Plus tard : Windows, Android.

## Questions ouvertes

- [ ] Choix du framework front pour la PWA → proposition ci-dessous, à valider.
- [ ] Stockage local PWA (IndexedDB) et limites iOS (quota, purge des données Safari).
- [ ] Google Drive : créer le projet Google Cloud + identifiant client OAuth (type « Application Web », origines JavaScript autorisées = URL d'hébergement de la PWA). Portée visée : `drive.appdata` (accès limité aux données de l'app).
- [ ] Google Drive : connexion OAuth dans une PWA installée sur iOS (mode plein écran) — les popups peuvent mal se comporter → prévoir le mode redirection. Jeton valable 1 h, renouvellement à gérer.
- [ ] Format de synchro (fichier JSON par appareil, horodatage, gestion des conflits).
- [ ] Hébergement de la PWA (ex. GitHub Pages, gratuit, HTTPS).
- [ ] Source de données code-barres (ex. Open Food Facts).
- [ ] Moteur OCR (local ou service en ligne).
- [ ] Source(s) de recettes internet.
- [ ] Gestion des dates de péremption ? (non demandé pour l'instant)
- [ ] Multi-utilisateurs / foyer partagé ?

## Proposition de stack technique (à valider)

| Besoin | Proposition | Pourquoi |
|--------|-------------|----------|
| Framework UI | **Svelte 5 + Vite** (SPA statique) | Léger, rapide sur mobile, peu de code, build statique facile à héberger (y compris sur Nextcloud/NAS) |
| PWA (installation, hors ligne) | **vite-plugin-pwa** (Workbox) | Manifest + service worker générés automatiquement |
| Stockage local | **IndexedDB via Dexie.js** | Requêtes simples, versions de schéma, adapté à la synchro |
| Synchro Google Drive | **Google Identity Services** (connexion) + **API Drive v3** via `fetch` + fichier JSON horodaté par appareil | Pas de serveur à développer, CORS supporté par Google |
| Scan code-barres | **BarcodeDetector** natif, repli **@zxing/browser** | iOS Safari n'a pas BarcodeDetector → ZXing nécessaire |
| Infos produit | **Open Food Facts** (API gratuite) | Nom, catégorie, image depuis le code-barres |
| OCR emballage | **Tesseract.js** (local, dans le navigateur) | Gratuit, hors ligne, sans service tiers |
| Langage | **TypeScript** | Moins d'erreurs sur le modèle de données |

Évolution : la même PWA fonctionne sur Android et Windows. Si une app native devient nécessaire plus tard : **Capacitor** (mobile) ou **Tauri** (desktop) peuvent emballer le même code.

Alternatives écartées : Flutter (iOS impose un compte Apple pour l'installation native), React Native (idem), React/Vue (viables mais plus lourds que Svelte pour ce projet).

## Journal des décisions

| Date | Décision |
|------|----------|
| 2026-10-14 | Création du fichier, cahier des charges initial. |
| 2026-10-14 | Quantités qualitatives : 3 niveaux (plus beaucoup / moyen / suffisamment). |
| 2026-10-14 | Application en PWA pour l'installation sur appareils Apple. |
| 2026-10-14 | Nextcloud hébergé par un prestataire : pas d'accès admin serveur. |
| 2026-10-14 | Test CORS : bloqué. Demande à envoyer au prestataire ; repli = proxy. |
| 2026-10-14 | Nextcloud abandonné pour l'instant. Synchro phase 1 = **Google Drive**. |

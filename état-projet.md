# InMyFridge — État du projet

_Dernière mise à jour : 2026-10-14_

## Statut

Phase : **développement — squelette PWA en place**.

- Fait : projet Svelte 5 + Vite + TypeScript, PWA installable (manifest, service worker, icônes), navigation par onglets (Stock / Courses / Recettes), base locale IndexedDB (Dexie), **liste de courses fonctionnelle**, **écran Stock fonctionnel**, workflow de déploiement GitHub Pages.
- Écran Recettes : vide (message « bientôt »).
- **En ligne** : https://binckje.github.io/InMyFridge/ (déployé et testé sur iPhone, hors ligne OK).
- Pas encore : synchro Google Drive, scan, OCR, recettes, configuration des emplacements.

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

## 5. Liste de courses (implémentée)

- Onglet par défaut à l'ouverture (usage principal en magasin, sur mobile).
- **Saisie rapide** en une ligne, quantité reconnue : « 2 l lait », « pâtes 500g », « yaourt x4 ».
- **Rayon deviné automatiquement** (mots-clés), puis **mémorisé** par article (si on corrige le rayon, l'app s'en souvient).
- **Suggestions** : articles les plus souvent achetés, proposés en puces sous le champ de saisie.
- **Pas de doublon** : ajouter un article déjà présent met juste à jour sa quantité.
- **Regroupement par rayon** (emoji + compteur), dans l'ordre du parcours en magasin.
- **Édition manuelle** : tap sur un article → feuille (nom, quantité, rayon, suppression). Suppression annulable 4 s.
- **Cocher = dans le panier** : article barré en bas, barre de progression, badge du nombre restant sur l'onglet, célébration 🎉 quand tout est coché, bouton « Vider le panier ».
- **Ajout auto sous seuil** : `syncLowStock()` ajoute les produits du stock sous leur seuil (étiquette « stock bas ») et retire ceux remontés. Actif dès que le stock sera saisi.
- Suppressions logiques (`deleted`) + `updatedAt` sur chaque enregistrement → prêt pour la synchro.

## 5 bis. Écran Stock (implémenté)

- **Emplacements fixes (v1)** en puces défilantes : Tout · ⚠️ Bas · les 6 emplacements (compteur). Frigo et congélateur regroupés par sous-catégorie, « Tout » regroupé par emplacement.
- **Champ unique chercher / ajouter** : filtre la liste en tapant ; ＋ ajoute dans l'emplacement affiché (deviné via le rayon si « Tout »). « lait 2 l », « riz 1 kg », « oeufs x6 ». Sans quantité → suivi par **niveau** (seuil par défaut « plus beaucoup »).
- **Choix du type de quantité à l'ajout** : puces sous le champ (🔢 Nombre · 📊 Niveau · g · kg · ml · cl · l), présélectionnées d'après le texte tapé, modifiables. Sans nombre tapé : 1.
- Produit déjà présent au même endroit : quantités additionnées (même unité), sinon remplacées.
- **Boutons − / +** : pièce ±1, g/ml ±100, cl ±10, kg/l ±0,25 ; niveau : niveau précédent / suivant (couleur rouge/orange/vert).
- **Tap sur le nom** → feuille : nom, emplacement, catégorie, mode Quantité (valeur + unité + seuil) ou Niveau (niveau + seuil), suppression annulable 4 s.
- Toute modification appelle `syncLowStock()` → ajout / retrait automatique dans les courses (étiquette « bas » dans le stock).

## 6. Stockage et synchronisation

- Données stockées sur chaque appareil (fonctionnement hors ligne).
- Synchronisation via **Google Drive** (phase 1), dans un **dossier partagé** « InMyFridge » :
  1. L'app crée le dossier dans le Drive du propriétaire.
  2. Le propriétaire partage le dossier (droits de modification) avec les autres membres du foyer.
  3. Chaque membre installe la PWA, se connecte avec **son propre compte Google**, et sélectionne le dossier une fois via **Google Picker**.
- Portée OAuth : `drive.file` (l'app n'accède qu'aux fichiers qu'elle a créés ou que l'utilisateur a choisis).
- Foyer : **2 utilisateurs** (moi + conjointe), chacun sur ses appareils. Les comptes sont ajoutés comme « utilisateurs test » dans la console Google (pas de validation Google nécessaire, avertissement « application non vérifiée » à la première connexion).
- Nextcloud mis de côté (hébergeur TabDigital bloque CORS). Option future : proxy **Cloudflare Worker** (gratuit) qui relaie les requêtes WebDAV vers `eli.it.tabdigital.cloud` en ajoutant les en-têtes CORS ; restreint à l'origine de la PWA et à `/remote.php/dav` ; authentification par mot de passe d'application Nextcloud propre à chaque utilisateur.
- Plus tard : synchronisation via **NAS**.
- Synchro écrite derrière une interface commune (adaptateurs) pour changer de fournisseur sans tout réécrire.

## 7. Plateformes cibles

- Phase 1 : **Linux** et **iOS** (pas de compte Apple Developer pour l'instant).
- Format : **PWA** (application web installable) — installation sur appareils Apple via Safari « Ajouter à l'écran d'accueil ».
- Plus tard : Windows, Android.

## Questions ouvertes

- [ ] Stockage local PWA (IndexedDB) et limites iOS (quota, purge des données Safari).
- [ ] Google Drive : créer le projet Google Cloud + identifiant client OAuth (type « Application Web », origines JavaScript autorisées = URL d'hébergement de la PWA). Portée : `drive.file` + Google Picker (clé API nécessaire pour le Picker).
- [ ] Google Drive : connexion OAuth dans une PWA installée sur iOS (mode plein écran) — les popups peuvent mal se comporter → prévoir le mode redirection. Jeton valable 1 h, renouvellement à gérer.
- [ ] Format de synchro et **gestion des conflits** (prioritaire : 2 utilisateurs peuvent modifier en même temps). Piste : journal de modifications horodatées par appareil, fusion à la lecture.
- [ ] Source de données code-barres (ex. Open Food Facts).
- [ ] Moteur OCR (local ou service en ligne).
- [ ] Source(s) de recettes internet.
- [ ] Gestion des dates de péremption ? (non demandé pour l'instant)

## Stack technique (validée)

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

## Structure du code

| Fichier | Rôle |
|---------|------|
| `src/App.svelte` | Onglets du bas, routage par `#hash` |
| `src/views/Courses.svelte` | Écran liste de courses |
| `src/views/Stock.svelte` | Écran stock |
| `src/views/Recettes.svelte` | Écran à venir |
| `src/lib/types.ts` | Modèle de données (StockItem, ShoppingItem, Aisle) |
| `src/lib/db.ts` | Base Dexie (tables `stock`, `shopping`, `memory`, schéma v2 : `locationId`) + stockage persistant |
| `src/lib/shopping.ts` | Logique courses (ajout, édition, suggestions, lien stock → courses) |
| `src/lib/stock.ts` | Logique stock (saisie rapide, −/+, édition, format) |
| `src/lib/locations.ts` | Emplacements, sous-catégories, devinette |
| `src/lib/aisles.ts` | Rayons par défaut + devinette du rayon |
| `.github/workflows/deploy.yml` | Build + publication GitHub Pages sur push `main` |

Commandes : `npm install`, `npm run dev` (serveur local accessible depuis le téléphone sur le même Wi-Fi), `npm run check`, `npm run build`.

## Prochaines étapes

1. Synchro Google Drive (adaptateur).
2. Scan code-barres + Open Food Facts.
3. Configuration des emplacements / catégories.

## Journal des décisions

| Date | Décision |
|------|----------|
| 2026-10-14 | Création du fichier, cahier des charges initial. |
| 2026-10-14 | Quantités qualitatives : 3 niveaux (plus beaucoup / moyen / suffisamment). |
| 2026-10-14 | Application en PWA pour l'installation sur appareils Apple. |
| 2026-10-14 | Nextcloud hébergé par un prestataire : pas d'accès admin serveur. |
| 2026-10-14 | Test CORS : bloqué. Demande à envoyer au prestataire ; repli = proxy. |
| 2026-10-14 | Nextcloud abandonné pour l'instant. Synchro phase 1 = **Google Drive**. |
| 2026-10-14 | Stack validée : Svelte 5 + Vite + TypeScript, hébergement **GitHub Pages**. |
| 2026-10-14 | Foyer de 2 utilisateurs, comptes Google séparés : dossier Drive partagé + portée `drive.file` + Google Picker (abandon de `appDataFolder`, non partageable). |
| 2026-10-14 | Squelette PWA créé. Liste de courses : saisie rapide, rayon deviné + mémorisé, suggestions, cocher, regroupement par rayon, ajout auto sous seuil. |
| 2026-10-14 | `typescript@~6` (svelte-check ne supporte pas encore TS 7 seul). |
| 2026-10-14 | Fusion sur `main`, GitHub Pages activé, PWA testée et fonctionnelle. |
| 2026-10-14 | Écran Stock : emplacements figés v1, saisie rapide + feuille, boutons − / +. |
| 2026-10-14 | Stock : choix du type de quantité à la saisie (puces). |

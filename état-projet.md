# InMyFridge — État du projet

_Dernière mise à jour : 2026-10-15 (travail de nuit)_

## Statut

Phase : **développement — toutes les fonctions du cahier des charges sont codées**, à tester sur iPhone.

- Fait : PWA Svelte 5 + Vite + TypeScript, base locale IndexedDB (Dexie), **liste de courses**, **stock**, **recettes**, **scan code-barres + Open Food Facts**, **photo d'emballage (OCR)**, **emplacements configurables**, **synchro Google Drive** (manuelle + automatique silencieuse), **sauvegarde / restauration JSON**, **tests automatiques** (vitest, 37 tests, lancés par le déploiement).
- **En ligne** : https://binckje.github.io/InMyFridge/ (version de `main` ; le travail de la nuit est sur la branche `claude/magical-albattani-uk1t3k`, à fusionner).
- Reste à faire par toi : configurer Google Cloud (synchro), tester sur iPhone (voir « À tester » plus bas).

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

## 5 ter. Recettes (implémenté)

- **31 recettes de base** (cuisine maison : crêpes, carbonara, gratin, quiche…), identifiants fixes `base-*` : pas de doublon à la synchro, une recette supprimée n'est pas réinstallée.
- **Comparaison au stock** : pluriels, accents, « œ », noms composés (« pomme de terre » ≠ « pomme », « lait de coco » ≠ « lait »), produits précis → génériques (spaghetti → pâtes, emmental → fromage, steak haché → boeuf haché). Quantités converties (g/kg, ml/cl/l, pièces) : quantité insuffisante = 🟠 « pas assez ». Sel, poivre, eau : toujours considérés présents (🧂 placard). Ingrédients « (facultatif) » non bloquants.
- Liste triée : faisables d'abord, puis par nombre de manquants ; anneau = part des ingrédients disponibles. Filtres **Toutes / ✅ Faisables / 🛒 Presque (1–2 manquants) / ⭐ Favorites (≥ 4 étoiles)**. Recherche par nom, ingrédient ou étiquette.
- **Fiche recette** : nombre de personnes — ou de pièces si la recette a une unité (« 20 cookies », champ « Unité » dans l'éditeur) — ajustable (quantités recalculées), note sur 5 étoiles, « 🛒 Ajouter les manquants aux courses », **« 👩‍🍳 J'ai cuisiné ça »** (retire les quantités du stock, descend d'un niveau les produits suivis par niveau ; annulable).
- **Créer / modifier / supprimer** une recette : ingrédients un par ligne (« 200 g farine », « 2 c. à soupe d'huile », « sel »), étapes une par ligne, emoji, temps, étiquettes.
- **Internet (TheMealDB, gratuit, sans compte)** : « Chercher « x » sur internet » (nom de plat ou ingrédient traduit fr → en) et « Idées sur internet avec mon stock ». Aperçu comparé au stock, puis « Enregistrer dans mes recettes ». Ingrédients et mesures traduits (cup, tbsp, lb, oz) ; **étapes en anglais** (pas d'API de recettes françaises gratuite accessible depuis le navigateur).

## 5 ter bis. Import / export de recettes (implémenté)

- Bouton **＋** de l'écran Recettes : « ✏️ Saisir à la main », « 📄 Importer un fichier » (**PDF, Word .docx, RTF, texte .txt/.md, JSON**), « 📸 Photo d'une recette » (OCR).
- **Une recette par fichier** (JSON exporté par l'app : plusieurs acceptées). Le texte est découpé en **fiche normalisée** (nom, personnes, temps, ingrédients, étapes) grâce aux titres « Ingrédients », « Préparation »… ou, sans titres, en devinant (lignes courtes = ingrédients, phrases = étapes). La fiche s'ouvre dans l'éditeur pour vérification avant enregistrement.
- PDF scanné (sans texte) : message invitant à utiliser la photo.
- **Export** au choix du format (**PDF, Word, Texte, Markdown, JSON**) : une recette (« ⬇️ Exporter » en bas de la fiche) ou toutes celles affichées (« ⬇️ Exporter ces N recettes » sous la liste). Même fiche normalisée dans tous les formats. Sur iPhone : feuille de partage (Fichiers, Mail…). Dernier format choisi mémorisé.
- Tout fonctionne hors ligne (lecteurs PDF/Word inclus dans l'app).

## 5 quater. Scan code-barres et photo (implémenté)

- Bouton **📷** à droite du champ de saisie (Stock : ranger ; Courses : ajouter à la liste ; remplace ＋ quand le champ est vide).
- Caméra arrière : `BarcodeDetector` natif (Android/Chrome), sinon **ZXing** chargé à la demande (iPhone). Chiffre de contrôle EAN vérifié. Saisie manuelle du code possible.
- **Open Food Facts** : nom, marque, contenance, photo ; rayon/emplacement devinés d'après les catégories. Fiche modifiable : nom, contenance × nombre (« 400 g » × 2 → 800 g), emplacement.
- Produits mémorisés (table `products`, synchronisée) : reconnus **hors ligne** et avec tes corrections.
- **Photo de l'emballage (OCR)** : Tesseract.js dans le navigateur, sans service en ligne. Moteur + données « français » (~4,6 Mo) servis par l'app et mis en cache à la première utilisation. Propose les textes lus (le plus gros d'abord = nom probable) et la contenance (« 500 g »).
- Ajouts en série : après « Ranger », retour au scan pour le produit suivant.

## 5 quinquies. Retour de courses (implémenté)

- « 🧺 Ranger et vider le panier » : feuille listant les articles cochés. Produits déjà suivis cochés d'office ; quantité achetée convertie dans l'unité du stock (500 g → 0,5 kg) et modifiable ; produits suivis par niveau remis à « suffisamment » ; nouveaux produits ajoutables. « Vider sans ranger » reste possible.

## 5 sexies. Emplacements configurables (implémenté)

- Bouton **⚙️** au bout des puces d'emplacements (écran Stock) : renommer, emoji, monter / descendre, ajouter (cave, cellier…), sous-catégories (ajout, renommage, ordre, suppression), suppression d'un emplacement **vide** uniquement.
- Table `locations` (synchronisée) ; valeurs par défaut installées au premier lancement.

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

### Implémentation (faite)

- **Déclenchement manuel** : icône ☁️ en haut à droite → feuille Synchro (compte, dernière synchro, bouton « Synchroniser maintenant », déconnexion).
- **Synchro automatique silencieuse** : au démarrage, au retour dans l'app, en la quittant et toutes les 5 min — seulement si le fichier est choisi et la connexion Google encore valide (≤ 1 h). Jamais de redirection imposée ; au-delà d'1 h, synchro manuelle.
- Données synchronisées : stock, courses, mémoire des rayons, **recettes, produits scannés, emplacements**.
- **Sauvegarde locale** (feuille ☁️, même sans Google) : « Télécharger » un fichier JSON, « Restaurer » (fusion, rien n'est effacé).
- **Un seul fichier** `inmyfridge-data.json` dans le dossier « InMyFridge » (plus simple que 1 fichier/appareil avec `drive.file` : l'autre membre n'a besoin de choisir qu'un fichier, une seule fois).
- Synchro = lire le fichier → fusion **dernière modif gagne par enregistrement** (`updatedAt` ; `lastUsed` pour la mémoire des rayons) → réécrire. Chaque appareil garde tout en local : si deux synchros se croisent, la suivante réintègre ce qui a été écrasé.
- Connexion OAuth par **redirection** (pas de popup, compatible PWA iOS). Jeton 1 h ; à expiration, nouvelle redirection automatique (adresse pré-remplie).
- Premier appareil : « Créer le dossier » ; autre compte : « Choisir le fichier partagé » (Google Picker). Même compte sur un autre appareil : fichier retrouvé automatiquement.
- Identifiants lus au build : `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` (variables GitHub `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID` ; en local `.env.local`, voir `.env.example`).
- Code : `src/lib/sync.ts` (fusion, interface `SyncProvider`), `src/lib/drive.ts` (OAuth, Drive, Picker), `src/views/SyncSheet.svelte`.

## 7. Plateformes cibles

- Phase 1 : **Linux** et **iOS** (pas de compte Apple Developer pour l'instant).
- Format : **PWA** (application web installable) — installation sur appareils Apple via Safari « Ajouter à l'écran d'accueil ».
- Plus tard : Windows, Android.

## Questions ouvertes

- [ ] Stockage local PWA (IndexedDB) et limites iOS (quota, purge des données Safari).
- [ ] Google Drive : **à faire par toi** — configurer le projet Google Cloud + identifiant client OAuth (type « Application Web », origines JavaScript autorisées = URL d'hébergement de la PWA). Portée : `drive.file` + Google Picker (clé API nécessaire pour le Picker).
- [x] Google Drive : connexion OAuth dans une PWA installée sur iOS (mode plein écran) — les popups peuvent mal se comporter → mode redirection retenu. À valider sur iPhone.
- [x] Format de synchro et **gestion des conflits** (prioritaire : 2 utilisateurs peuvent modifier en même temps). Retenu : fichier unique, dernière modif gagne par enregistrement.
- [x] Source de données code-barres : **Open Food Facts**.
- [x] Moteur OCR : **Tesseract.js local** (servi par l'app).
- [x] Recettes internet : **TheMealDB** (anglais, ingrédients traduits). Alternative française à trouver si besoin (aucune API gratuite avec CORS connue).
- [x] Synchro concurrente : version Drive vérifiée avant écriture, relecture + nouvelle fusion en cas de conflit (3 essais) ; fichier illisible / version inconnue → erreur, rien n'est écrasé.
- [ ] Synchro : connexion Google limitée à 1 h (flux sans serveur). Pour une synchro auto permanente, il faudrait un petit serveur (ex. Cloudflare Worker) qui garde un jeton de rafraîchissement.
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
| `src/views/Recettes.svelte` | Écran recettes (liste, filtres, recherche, internet) |
| `src/views/RecipeSheet.svelte` | Fiche recette (ingrédients vs stock, personnes, cuisiner, note) |
| `src/views/RecipeEditor.svelte` | Création / modification d'une recette |
| `src/views/ScanSheet.svelte` | Scan code-barres, saisie du code, photo OCR, fiche produit |
| `src/views/RestockSheet.svelte` | Ranger les courses dans le stock |
| `src/views/LocationsSheet.svelte` | Configuration des emplacements |
| `src/lib/recipes.ts` | Lecture des ingrédients, comparaison au stock, cuisiner, recettes de base |
| `src/lib/recipes-seed.ts` | Les 30 recettes de base |
| `src/lib/web-recipes.ts` | TheMealDB + traduction des ingrédients |
| `src/lib/barcode.ts` | Caméra (BarcodeDetector / ZXing), Open Food Facts, mémoire produits |
| `src/lib/ocr.ts` | Tesseract.js, suggestions de nom et contenance |
| `src/lib/backup.ts` | Sauvegarde / restauration JSON |
| `src/lib/recipe-import.ts` | Texte des fichiers (pdf, docx, rtf, txt) → fiche recette normalisée |
| `src/lib/recipe-export.ts` | Export PDF, Word, texte, Markdown, JSON ; partage / téléchargement |
| `src/views/ExportSheet.svelte` | Choix du format d'export |
| `src/lib/autosync.ts` | Synchro automatique silencieuse |
| `tests/*.test.ts` | Tests automatiques (vitest + fake-indexeddb) |
| `src/lib/types.ts` | Modèle de données (StockItem, ShoppingItem, Recipe, Product, Location…) |
| `src/lib/db.ts` | Base Dexie v5 (`stock`, `shopping`, `memory`, `recipes`, `products`, `locations`) + stockage persistant |
| `src/lib/shopping.ts` | Logique courses (ajout, édition, suggestions, lien stock → courses) |
| `src/lib/stock.ts` | Logique stock (saisie rapide, −/+, édition, format, conversion d'unités, rangement des courses) |
| `src/lib/locations.svelte.ts` | Emplacements (état réactif, base, configuration), devinette |
| `src/lib/sync.ts` | Fusion local ↔ distant, interface `SyncProvider` |
| `src/lib/drive.ts` | Google Drive : OAuth (redirection), fichiers, Picker |
| `src/views/SyncSheet.svelte` | Feuille Synchro (☁️) |
| `src/lib/aisles.ts` | Rayons par défaut + devinette du rayon |
| `.github/workflows/deploy.yml` | Build + publication GitHub Pages sur push `main` |

Commandes : `npm install`, `npm run dev` (serveur local accessible depuis le téléphone sur le même Wi-Fi), `npm run check`, `npm test`, `npm run build`.

Note : en local via le Wi-Fi (`http://192.168…`), la caméra est bloquée par le navigateur (https obligatoire) : la saisie manuelle du code et la photo restent possibles. Sur GitHub Pages (https), tout fonctionne.

## À tester (par toi, sur iPhone)

1. Fusionner la branche `claude/magical-albattani-uk1t3k` dans `main` (PR sur GitHub) → déploiement auto → rouvrir la PWA (fermer/rouvrir 2 fois pour la mise à jour).
2. **Recettes** : onglet Recettes → 31 recettes. Ajouter « oeufs 6 », « beurre », « fromage râpé 200 g » dans Stock → « Omelette au fromage » doit passer en ✅ Faisable. Ouvrir, « J'ai cuisiné ça » → vérifier le stock (oeufs 2) puis « Annuler ».
3. **Scan** : Stock → 📷 → autoriser la caméra → viser un code-barres (ex. pot de Nutella) → fiche remplie → « Ranger ». Rescanner le même produit hors ligne (mode avion) → reconnu.
4. **Photo** : 📷 → « Photo de l'emballage » → photographier un paquet sans code lisible → choisir le nom proposé. (1re fois : connexion nécessaire, ~5 Mo.)
5. **Courses → stock** : cocher des articles → « Ranger et vider le panier » → vérifier les quantités dans Stock.
6. **Emplacements** : Stock → ⚙️ au bout des puces → ajouter « Cave », une sous-catégorie, réordonner.
7. **Internet** : Recettes → taper « poulet » → « Chercher sur internet » → ouvrir → « Enregistrer ».
8. **Sauvegarde** : ☁️ → « Télécharger » (le fichier part dans Fichiers).
9. **Import** : Recettes → ＋ → « Importer un fichier » → choisir un PDF ou un Word de recette (dans Fichiers) → vérifier la fiche → Enregistrer. Idem « Photo d'une recette » sur une page de livre.
10. **Export** : ouvrir une recette → « ⬇️ Exporter » → PDF → « Enregistrer dans Fichiers ».

## Prochaines étapes

1. Configurer Google Cloud + variables GitHub, tester la synchro à 2 comptes.
2. Retours du test iPhone (ergonomie, recettes manquantes, mots-clés de rayons).
3. Idées : dates de péremption (« à consommer en priorité » dans les recettes), notifications stock bas, liste de courses partagée en temps réel (nécessite un serveur), import de recette par copier-coller de texte.

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
| 2026-10-14 | Synchro Drive : manuelle (bouton), fichier unique partagé, dernière modif gagne, OAuth par redirection. |
| 2026-10-14 | Tests automatiques (vitest + fake-indexeddb), lancés avant chaque déploiement. |
| 2026-10-15 | Recettes en pièces (`yieldUnit`, ex. 20 cookies) + recette de base Cookies. |
| 2026-10-14 | Recettes : 30 recettes de base à identifiants fixes, comparaison au stock avec conversions d'unités, « J'ai cuisiné ça » déduit le stock. |
| 2026-10-14 | Vider le panier → ranger les achats dans le stock (quantités converties). |
| 2026-10-14 | Code-barres : BarcodeDetector + repli ZXing ; Open Food Facts ; produits mémorisés et synchronisés. |
| 2026-10-14 | Emplacements configurables, stockés en base et synchronisés. |
| 2026-10-14 | Recettes internet : TheMealDB (seule API gratuite sans clé accessible depuis le navigateur), ingrédients traduits. |
| 2026-10-14 | OCR : Tesseract.js servi par l'app (pas de CDN), mis en cache à la première utilisation. |
| 2026-10-14 | Sauvegarde JSON locale + synchro auto silencieuse (si connexion Google < 1 h). |
| 2026-10-15 | Corrections : synchro sans écrasement (contrôle de version Drive), rangement relu en base, mesures TheMealDB (fractions, parenthèses, unités). |
| 2026-10-15 | Import de recettes (pdf via pdf.js, docx via fflate, rtf, txt, json, photo) en fiche normalisée vérifiée avant enregistrement ; export PDF (jsPDF), Word, texte, Markdown, JSON. |

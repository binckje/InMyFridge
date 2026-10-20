# InMyFridge — Carte du code

_Dernière mise à jour : 2026-10-18_

But : permettre de reprendre le projet sans accès GitHub. Pour chaque fichier : rôle, fonctions exportées, qui l'appelle, ce qu'il appelle. Les numéros de ligne sont indicatifs (`fichier:ligne`).

Voir aussi `état-projet.md` (fonctionnalités, statut, tests à faire).

---

## 1. Démarrage rapide en local

```bash
npm install
cp .env.example .env.local   # remplir les clés Google (optionnel, seulement pour la synchro Drive)
npm run dev                  # serveur local (accessible depuis le téléphone sur le même Wi-Fi)
npm test                     # tests vitest
npm run check                # vérification TypeScript / Svelte
npm run build                # build de production dans dist/
```

Variables d'environnement (lues dans `src/lib/drive.ts:8-10`) :
- `VITE_GOOGLE_CLIENT_ID` — connexion Google (OAuth)
- `VITE_GOOGLE_API_KEY` + `VITE_GOOGLE_APP_ID` — Google Picker (choisir un fichier existant)

Déploiement : `.github/workflows/deploy.yml` → GitHub Pages (`base = /InMyFridge/` quand `GITHUB_ACTIONS` est défini, voir `vite.config.ts:39`).

---

## 2. Architecture en un coup d'œil

```
index.html
 └─ src/main.ts            (démarrage : services de fond + montage de App)
     └─ src/App.svelte     (4 onglets + bouton ☁️)
         ├─ views/Home.svelte       (Accueil : ajout rapide)
         ├─ views/Stock.svelte      (Stock)      ── LocationsSheet, ScanSheet
         ├─ views/Courses.svelte    (Courses)    ── RestockSheet, ScanSheet
         ├─ views/Recettes.svelte   (Recettes)   ── RecipeSheet, RecipeEditor, ExportSheet
         └─ views/SyncSheet.svelte  (fenêtre ☁️ : Drive, sauvegardes, copies locales)

src/lib/  = logique métier, sans interface
  db.ts         base IndexedDB (Dexie) — TOUTES les données passent par là
  types.ts      types partagés
  stock.ts / shopping.ts / recipes.ts / locations.svelte.ts / aisles.ts   métier
  sync.ts / drive.ts / autosync.ts / backup.ts / safety.ts               sauvegarde & synchro
  barcode.ts / ocr.ts / media.ts                                        caméra, photos, vidéos
  recipe-import.ts / recipe-export.ts / web-recipes.ts / recipes-seed.ts recettes externes
```

Principes communs :
- Toutes les données sont dans IndexedDB (`db`). Les vues lisent avec `liveQuery(...)` de Dexie (rafraîchissement automatique) et écrivent via les fonctions de `src/lib`.
- **Suppression logique** : on ne supprime pas, on met `deleted: true` + `updatedAt` (nécessaire pour propager les suppressions à la synchro). Les vues filtrent `!x.deleted`.
- **`updatedAt`** doit être mis à jour à chaque modification : c'est lui qui décide quelle version gagne à la synchro (la plus récente).
- Svelte 5 « runes » : `$state`, `$derived`, `$effect`, `$props`. Un store Dexie se lit avec `$nomDuStore`.
- Bibliothèques lourdes chargées à la demande (`await import(...)`) : tesseract.js (OCR), @zxing (code-barres), pdfjs-dist, jspdf, fflate.

---

## 3. Graphe des dépendances (qui importe qui)

| Fichier | Importe (fichiers du projet) | Importé par |
|---|---|---|
| `main.ts` | App, db, drive, recipes, locations, autosync, safety | index.html |
| `App.svelte` | Home, Courses, Stock, Recettes, SyncSheet, drive (type), db, safety | main.ts |
| `lib/types.ts` | — | presque tout |
| `lib/db.ts` | types, sync (type) | presque tout |
| `lib/aisles.ts` | types | barcode, shopping, Courses, ScanSheet |
| `lib/locations.svelte.ts` | db, types | main, stock, Stock, LocationsSheet, ScanSheet |
| `lib/shopping.ts` | db, aisles, types | stock, recipes, Home, Courses, Stock, RestockSheet, ScanSheet |
| `lib/stock.ts` | db, shopping, locations, types | barcode, ocr, recipes, Home, Stock, RestockSheet, ScanSheet |
| `lib/recipes.ts` | db, shopping, stock, recipes-seed, types | main, recipe-export, recipe-import, web-recipes, Recettes, RecipeSheet, RecipeEditor |
| `lib/recipes-seed.ts` | — | recipes |
| `lib/sync.ts` | db, types | drive, autosync, backup, safety, SyncSheet |
| `lib/drive.ts` | sync | main, autosync, safety, App, SyncSheet |
| `lib/autosync.ts` | drive, sync, safety | main |
| `lib/backup.ts` | sync | safety, SyncSheet |
| `lib/safety.ts` | db, backup, drive, sync | main, autosync, App, SyncSheet |
| `lib/barcode.ts` | db, aisles, stock, types | ScanSheet |
| `lib/ocr.ts` | stock | ScanSheet, Recettes (import dynamique) |
| `lib/media.ts` | db | Recettes, RecipeSheet, RecipeEditor |
| `lib/recipe-import.ts` | recipes, types | Recettes |
| `lib/recipe-export.ts` | recipes, types | ExportSheet |
| `lib/web-recipes.ts` | recipes, types | Recettes |

> Attention : `autosync ↔ safety ↔ drive` et `backup ↔ safety ↔ sync` forment des boucles d'import ; ne pas ajouter d'appel au niveau module (hors fonction) entre ces fichiers.

---

## 4. Racine

### `src/main.ts`
Point d'entrée. Ordre :
1. `handleRedirect()` (drive) — traite le retour de connexion Google (jeton dans l'URL) **avant** que App lise le `#onglet`.
2. `requestPersistence()` (db) — demande à iOS de ne pas purger les données.
3. `seedRecipes()` (recipes) — insère les recettes de base si absentes.
4. `seedLocations().then(watchLocations)` (locations) — emplacements par défaut puis écoute des changements.
5. `startAutoSync()` (autosync) — seulement s'il n'y a pas de connexion Google en cours.
6. `startSafety()` (safety) — copies locales automatiques + alerte de fermeture.
7. `mount(App, { props: { pending } })`.

### `src/App.svelte`
Coquille : barre d'onglets (`accueil`, `stock`, `courses`, `recettes`), onglet mémorisé dans `location.hash`.
- Bouton ☁️ ouvre `SyncSheet` ; point rouge si `$localChange > lastSaved()` (safety).
- Badge sur Courses = nombre d'articles non cochés (`liveQuery` sur `db.shopping`).
- `onSaved()` (safety) rafraîchit l'état « sauvegardé ».
- Passe `ongo` à Home pour changer d'onglet.

### `src/app.css`
Styles globaux (variables de couleurs, boutons, fiches « sheet »).

---

## 5. `src/lib/` — logique

### `types.ts`
- `SyncFields` { id, updatedAt, deleted? } — base de toutes les entités synchronisées.
- `Level` / `LEVELS` = `'plus beaucoup' | 'moyen' | 'suffisamment'` (quantité approximative).
- `Unit` = `'g' | 'kg' | 'ml' | 'cl' | 'l' | 'pièce'`.
- `StockItem` (article en stock : name, qty/unit ou level, packs, locationId, categoryId, aisleId, seuil…), `ShoppingItem` (article de courses), `Category`, `Location`, `StoredLocation`, `Aisle` (rayon), `RecipeIngredient`, `Recipe`, `Product` (fiche code-barres en cache).

### `db.ts` — base de données
- `db` : base Dexie `inmyfridge`. Tables : `stock`, `shopping`, `memory` (mots déjà tapés → rayon), `recipes`, `products` (cache code-barres), `locations`, `groups` (groupes de produits à seuil commun), `videos` (vidéos de recettes, non synchronisées), `snapshots` (copies locales, non synchronisées).
- Versions de schéma 1 → 7 (`db.ts:39-60`). **Pour ajouter une table ou un index : ajouter `db.version(8).stores({...})`, ne jamais modifier une version existante.**
- `newId()` — UUID. `requestPersistence()` — appelé par main.
- Types `Memory`, `RecipeVideo`, `LocalSnapshot`.

### `aisles.ts` — rayons du magasin
- `AISLES` — liste des rayons (ordre = ordre d'affichage dans Courses).
- `aisleById(id)` — utilisé par Courses.
- `guessAisle(name)` — devine le rayon par mots-clés. Appelé par shopping (`aisleFor`), barcode, ScanSheet.

### `locations.svelte.ts` — emplacements (frigo, congélateur…)
Fichier `.svelte.ts` car `LOCATIONS` est un `$state` réactif.
- `DEFAULT_LOCATIONS`, `LOCATIONS` (liste réactive).
- `seedLocations()`, `watchLocations()` — main.
- `locationById(id)`, `categoryOf(loc, id)` — Stock, stock.ts.
- `guessLocation(aisleId)`, `guessCategory(aisleId)` — rayon → emplacement/catégorie par défaut. Utilisés par stock.ts (`addStock`) et ScanSheet.
- `updateLocation`, `addLocation`, `moveLocation`, `deleteLocation` (renvoie le nb d'articles concernés), `newCategory` — LocationsSheet.

### `shopping.ts` — liste de courses
- `aisleFor(name)` — rayon mémorisé (table `memory`) sinon `guessAisle`. Utilisé par stock.ts.
- `parseShopping("2 l lait")` → `{ name, qty }` — Home, Courses.
- `addItem(name, qty, aisleId?)` — ajoute ou fusionne avec un article existant non coché. Appelé par Home, Courses, ScanSheet, recipes (`addMissingToShopping`).
- `updateItem`, `toggleItem`, `deleteItem` (logique), `clearChecked` — Courses, RestockSheet.
- `suggestions(prefix)` — auto-complétion depuis `memory` — Courses.
- `isLow(stockItem)` — article sous le seuil (toujours faux pour un article d'un groupe) — Stock, `syncLowStock`.
- `groupTotal(group, stock)`, `isGroupLow(group, stock)`, `groupMembers` — total d'un groupe (somme convertie ou nombre de produits en stock) — Stock, `syncLowStock`.
- `syncLowStock()` — ajoute aux courses les articles et groupes de stock bas. Appelé par stock.ts (après modif) et Courses.

### `stock.ts` — stock
- `UNITS`, type `QtyKind`, `detectKind(input)`.
- `parseStock("6 x 1 l lait")` → `{ name, qty, unit, packs }` — Stock, barcode, ocr.
- `addStock(...)` — ajoute ou cumule ; devine rayon/emplacement/catégorie. Appelé par Home, Stock, ScanSheet.
- `updateStock(id, changes)` (met à jour `updatedAt` puis `syncLowStock`), `deleteStock` — Stock, recipes (`cook`).
- `saveGroup(name, settings)` — crée ou met à jour le groupe du même nom, retourne son id — Stock.
- Paquets (« packs » = contenants entamés/non entamés) : `splitPacks`, `withQty`, `addPacks`, `formatPacks`.
- `adjust(item, ±1)` — boutons +/− de Stock.
- `formatQty`, `convert(qty, from, to)`.
- `planRestock(items)` / `applyRestock(lines)` + type `RestockLine` — remise en stock des articles cochés aux courses. RestockSheet.

### `recipes.ts` — recettes et correspondance avec le stock
- `tokens(name)` — normalise un nom en mots (sans accents, singulier). Utilisé par Recettes (recherche), web-recipes.
- Correspondance ingrédient ↔ stock : `matchKind` (`'exact' | 'substitute' | 'close'`), `matches`, `isBasic` (sel, poivre…).
- `parseIngredient("200 g farine")`, `formatIngredient(ing, scale)`, `qtyLabel` — RecipeEditor, RecipeSheet, recipe-import, web-recipes, recipe-export.
- `checkIngredient`, `checkRecipe(recipe, stock, scale, useClose)` → `RecipeCheck` (statut `ok/low/missing/basic` par ingrédient) — RecipeSheet.
- `rank(recipes, stock)` — tri des recettes faisables — Recettes.
- `addMissingToShopping(check, scale)` — RecipeSheet.
- `cook(check, scale, choice)` → `Consumption[]` (décompte du stock via `updateStock/withQty`), `undoCook(done)` — RecipeSheet.
- `saveRecipe`, `rateRecipe`, `deleteRecipe` (logique), `seedRecipes` (main).
- Catégories de recette (stockées dans `tags`) : `CATEGORIES`, `categoryOf(tags)`, `withCategory`, `setCategory(ids, cat)` — Recettes, RecipeEditor. ⚠ Homonyme de `categoryOf` de locations.svelte.ts (différent).
- `yieldLabel(n, unit)` — « 4 personnes » — RecipeSheet, recipe-export.

### `recipes-seed.ts`
`SEED_RECIPES` — recettes fournies par défaut, insérées par `seedRecipes()`.

### `sync.ts` — moteur de fusion (indépendant de Google)
- `Snapshot` — format du fichier de sauvegarde (version, savedAt, stock, shopping, memory, recipes, products, locations).
- `SyncProvider` { read(), write(snapshot) } — interface implémentée par drive (Google Drive), backup (fichier JSON), safety (copie locale).
- `SyncConflict` — levée par le provider si le fichier a changé entre lecture et écriture.
- `syncWith(provider)` — lit, fusionne (`mergeBy` : la version au `updatedAt` le plus récent gagne, par id), écrit dans `db`, réécrit le fichier fusionné. 3 essais en cas de conflit. Renvoie `{ received }` (nb d'éléments modifiés localement).
- ⚠ Pour synchroniser une **nouvelle table**, l'ajouter dans `syncOnce` (`sync.ts:62`), dans `Snapshot`, et dans `exportData` de backup.

### `drive.ts` — Google Drive
- État dans localStorage : `getState()`, `setState()` (fileId, email, lastSync, error…).
- `isConfigured()` (CLIENT_ID présent), `canPick()` (Picker possible).
- Connexion par redirection : `signIn(pending)` → Google → retour → `handleRedirect()` (main) renvoie l'action en attente (`'sync' | 'create' | 'pick'`). `hasToken()` : jeton valide ~1 h. `NeedAuth` : erreur « reconnecte-toi ».
- `fetchEmail`, `findFile`, `createFile`, `pickFile` (Google Picker) — SyncSheet.
- `driveProvider(fileId)` — `SyncProvider` Drive (détecte les conflits par version du fichier) — autosync, SyncSheet.

### `autosync.ts`
- `autoSync()` — synchro silencieuse si fichier choisi + jeton valide + en ligne ; appelle `markSaved()`.
- `startAutoSync()` — main : 2 s après démarrage, à chaque changement de visibilité, toutes les 5 min.

### `backup.ts` — fichier JSON manuel
- `exportData()` — Snapshot complet (via `syncWith` avec un provider qui capture l'écriture). Utilisé par safety.
- `downloadBackup()`, `importBackup(text)` — SyncSheet.

### `safety.ts` — filet de sécurité
- `lastLocalChange()` / `localChange` (store liveQuery) — date de la dernière modif locale. App, SyncSheet.
- `lastSaved()`, `markSaved(backup?)`, `onSaved(fn)` — « sauvegardé quand ? » (localStorage + événement). autosync, App, SyncSheet.
- Copies locales (table `snapshots`, 10 max, ≤ 1/heure) : `takeSnapshot(force)`, `listSnapshots`, `snapshotSize`, `restoreSnapshot(id)` (fusion, pas écrasement) — SyncSheet.
- `startSafety()` — main : copies toutes les 15 min et en quittant l'app ; alerte `beforeunload` si non sauvegardé.

### `barcode.ts` — code-barres
- `validCode(code)` — contrôle EAN/UPC.
- `startScanner(video, onCode)` → `Scanner` — caméra (BarcodeDetector natif, sinon @zxing). ScanSheet.
- `decodePhoto(file)` — lit un code sur une photo. ScanSheet.
- `lookup(code)` — cache `db.products` puis API Open Food Facts (et sites frères) → `Product`. ScanSheet.
- `aisleFromCategories(tags, name)` — catégories OFF → rayon.
- `rememberProduct(p)` — enregistre la fiche (corrections de l'utilisateur). ScanSheet.

### `ocr.ts` — lecture de texte sur photo
- `readPhoto(image, onProgress)` → `OcrLine[]` — tesseract.js, données de langue servies depuis `BASE_URL/tesseract/` (copiées au build par `vite.config.ts`). ScanSheet, Recettes (import photo).
- `suggest(lines)` — propose noms de produit + quantité. ScanSheet.

### `media.ts` — images et vidéos de recettes
- `resizeImage(blob)` → data URL 800×600, `imageFromUrl(url)`, `thumb(image)` — RecipeEditor, Recettes.
- `getVideo`, `saveVideo`, `deleteVideo` (table `videos`, max `MAX_VIDEO` = 50 Mo) — RecipeEditor, RecipeSheet.
- `embedUrl(url)` — lien YouTube/Vimeo → URL intégrable. RecipeSheet.

### `recipe-import.ts`
- `IMPORT_ACCEPT` — formats acceptés. `fileText(file)` — choisit l'extracteur : `docxText` (fflate), `rtfText`, `pdfText` (pdfjs-dist), texte brut.
- `findServings`, `findTime`, `findTimes` — extraction portions / temps.
- `parseRecipeText(raw)` → recette (titre, ingrédients, étapes) ; `parseRecipeJson(text)` → liste. Recettes.

### `recipe-export.ts`
- `FORMATS` (`txt, md, docx, pdf, json`), `timeLabels`.
- `toText`, `toMarkdown`, `toJson`, `toDocx` (fflate), `toPdf` (jspdf).
- `exportBlob(recipes, format)`, `saveFile(blob, name)` (partage iOS ou téléchargement). ExportSheet.

### `web-recipes.ts` — recettes internet (TheMealDB, en anglais)
- `toFrench`, `toEnglish`, `measure` — traduction ingrédients/mesures.
- `searchWeb(query)`, `ideasFromStock(names)` → `WebHit[]`, `fetchWebRecipe(id)` → `Recipe` (id `web-<id>`). Recettes.

---

## 6. `src/views/` — écrans

| Vue | Rôle | Appelle | Ouverte par |
|---|---|---|---|
| `Home.svelte` | Accueil : 2 champs d'ajout rapide (stock / courses), compteurs, raccourcis vers onglets, bouton scan | db, `addItem`, `parseShopping`, `addStock`, ScanSheet | App |
| `Stock.svelte` | Liste du stock par emplacement/catégorie, recherche, +/−, saisie directe de quantité, édition, paquets, annuler suppression | db, `LOCATIONS`, `categoryOf`, `locationById`, `isLow`, `UNITS`, `addStock`, `detectKind`, `adjust`, `deleteStock`, `formatPacks`, `formatQty`, `parseStock`, `splitPacks`, `updateStock`, `withQty`, ScanSheet, LocationsSheet | App |
| `Courses.svelte` | Liste de courses groupée par rayon, auto-complétion, cocher, édition, annuler, « remettre en stock » | db, `AISLES`, `aisleById`, `addItem`, `deleteItem`, `suggestions`, `syncLowStock`, `toggleItem`, `updateItem`, `parseShopping`, RestockSheet, ScanSheet | App |
| `Recettes.svelte` | Liste triée (`rank`), filtres catégorie, recherche, sélection multiple (catégoriser/supprimer/exporter), import fichier/photo, recherche internet | `thumb`, db, `CATEGORIES`, `categoryOf`, `deleteRecipe`, `rank`, `saveRecipe`, `setCategory`, `tokens`, web-recipes, recipe-import, `readPhoto` (dynamique), RecipeSheet, RecipeEditor, ExportSheet | App |
| `RecipeSheet.svelte` | Fiche recette : portions, état de chaque ingrédient, choix du produit, « ajouter manquants », « je cuisine » (+ annuler), note, vidéo | recipes (`checkRecipe`, `cook`, `undoCook`, `addMissingToShopping`, `matchKind`, `rateRecipe`, `formatIngredient`, `yieldLabel`), `embedUrl`, `getVideo` | Recettes |
| `RecipeEditor.svelte` | Création/modification recette (photo, lien image, vidéo, catégorie, ingrédients/étapes une par ligne) | recipes (`saveRecipe`, `deleteRecipe`, `parseIngredient`, `formatIngredient`, `CATEGORIES`, `categoryOf`, `withCategory`), media | Recettes |
| `ExportSheet.svelte` | Choix du format d'export | `FORMATS`, `exportBlob`, `saveFile` | Recettes |
| `ScanSheet.svelte` | Scan code-barres (caméra ou photo), photo d'emballage (OCR), saisie manuelle, puis ajout au stock ou aux courses | barcode, ocr, `AISLES`, `guessAisle`, `LOCATIONS`, `guessLocation`, `addItem`, `addStock` | Home, Stock, Courses |
| `RestockSheet.svelte` | Après les courses : quantités achetées → stock | `planRestock`, `applyRestock`, `formatQty`, `clearChecked` | Courses |
| `LocationsSheet.svelte` | Gérer emplacements et catégories (ajout, renommage, ordre, suppression) | locations.svelte.ts | Stock |
| `SyncSheet.svelte` | Google Drive (connexion, créer/choisir fichier, synchro), télécharger/importer sauvegarde JSON, copies locales | drive, `syncWith`, backup, safety | App (bouton ☁️) |

Convention des fiches (« sheets ») : props `onclose` (et parfois `ondone`), affichées par un `{#if ...}` dans la vue parente.

---

## 7. Parcours typiques (pour déboguer)

- **Ajouter au stock** : Home/Stock/ScanSheet → `parseStock` → `addStock` → `aisleFor` + `guessLocation/guessCategory` → `db.stock` → `syncLowStock`.
- **Cocher une course puis ranger** : Courses `toggleItem` → bouton « ranger » → RestockSheet `planRestock` → `applyRestock` (→ `addStock`/`updateStock`) → `clearChecked`.
- **Stock bas → courses** : `updateStock` → `syncLowStock` → `isLow` → `addItem`.
- **Suggestion de recettes** : Recettes `rank(recipes, stock)` → `checkRecipe` → `checkIngredient` → `matchKind`/`tokens`.
- **Je cuisine** : RecipeSheet `cook` → `withQty` + `updateStock` ; `undoCook` pour annuler.
- **Synchro** : ☁️ SyncSheet ou `autoSync` → `driveProvider(fileId)` → `syncWith` → `mergeBy` → `db` + écriture Drive → `markSaved`.
- **Scan** : ScanSheet `startScanner`/`decodePhoto` → `validCode` → `lookup` (cache puis Open Food Facts) → formulaire → `rememberProduct` + `addStock`/`addItem`.

---

## 8. Tests (`tests/`, vitest + fake-indexeddb)

| Fichier | Couvre |
|---|---|
| `logic.test.ts` | stock.ts, shopping.ts (parsing, paquets, stock bas, remise en stock) |
| `recipes.test.ts` | recipes.ts (correspondance, cook, rank…) |
| `import.test.ts` | recipe-import.ts |
| `web-recipes.test.ts` | web-recipes.ts |
| `barcode.test.ts` | barcode.ts (`validCode`, `lookup`, rayons) |
| `ocr.test.ts` | ocr.ts (`suggest`) |
| `locations.test.ts` | locations.svelte.ts |
| `backup.test.ts`, `safety.test.ts` | backup.ts, safety.ts |
| `setup.ts` | initialise fake-indexeddb |

---

## 9. Travailler sans GitHub : comment me transmettre le contexte

Quand tu me demandes une modif ou un débogage sans accès au dépôt :
1. Joins ce fichier (ou indique qu'il est à jour) + le(s) fichier(s) concerné(s) cités dans les tableaux ci-dessus.
2. Pour un bug : l'écran concerné, ce que tu as fait, le message d'erreur (console Safari : Réglages › Safari › Avancé › Inspecteur web, ou `npm run dev` sur ordinateur + console du navigateur).
3. Je te répondrai avec des remplacements précis : « dans `src/lib/stock.ts`, remplacer le bloc … par … ».
4. Après modif : `npm test` puis `npm run check`, et envoie-moi la sortie si ça échoue.

**Garder ce fichier à jour** : à chaque ajout/renommage de fonction ou de fichier, mettre à jour les sections 3, 5 ou 6.

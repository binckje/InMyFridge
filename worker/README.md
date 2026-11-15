# Worker Cloudflare d'InMyFridge

Relais entre l'app et internet : il lit les pages de recettes (interdit au navigateur) et garde les clés API (YouTube, Edamam) hors de l'app.
Gratuit jusqu'à 100 000 appels par jour. Un seul fichier : `worker.js`.

## 1. Créer le Worker

1. Créer un compte sur <https://dash.cloudflare.com> (gratuit).
2. Menu **Compute (Workers)** › **Workers & Pages** › **Create** › **Create Worker** (modèle « Hello World »).
3. Nom : `inmyfridge` › **Deploy**.
4. **Edit code** : supprimer tout le contenu, coller celui de `worker.js`, puis **Deploy**.
5. Noter l'adresse affichée : `https://inmyfridge.<ton-compte>.workers.dev`.

Vérification : ouvrir cette adresse dans le navigateur. Réponse attendue : `{"ok":true,"youtube":false,"edamam":false}`.

## 2. Variables et secrets

Dans le Worker : **Settings** › **Variables and Secrets** › **Add**. Après chaque ajout : **Deploy**.

| Nom | Type | Valeur |
|---|---|---|
| `ALLOWED_ORIGINS` | Text | Adresse de l'app, sans chemin : `https://binckje.github.io` (déjà la valeur par défaut ; plusieurs adresses séparées par des virgules). `localhost` est toujours accepté. |
| `YOUTUBE_KEY` | Secret | Clé « YouTube Data API v3 » (voir 3). |
| `EDAMAM_ID` | Secret | Application ID Edamam (voir 4). |
| `EDAMAM_KEY` | Secret | Application Key Edamam. |
| `EDAMAM_USER` | Text | Facultatif : identifiant de compte Edamam, seulement si Edamam répond qu'il manque `Edamam-Account-User`. |

## 3. Clé YouTube

1. <https://console.cloud.google.com> › même projet que la synchro Drive (ou un nouveau).
2. **API et services** › **Bibliothèque** › « YouTube Data API v3 » › **Activer**.
3. **Identifiants** › **Créer des identifiants** › **Clé API**.
4. Restreindre la clé : **Restrictions relatives aux API** › YouTube Data API v3 uniquement. Pas de restriction par site : l'appel vient du Worker.
5. Coller la clé dans le secret `YOUTUBE_KEY`.

Quota gratuit : 10 000 unités par jour, une recherche en coûte 101, soit environ 100 recherches par jour.

## 4. Clés Edamam

1. <https://developer.edamam.com> › créer un compte › **Recipe Search API** › choisir une offre (vérifier les offres gratuites du moment).
2. **Dashboard** › **Applications** › créer une application › copier **Application ID** et **Application Key**.
3. Les coller dans `EDAMAM_ID` et `EDAMAM_KEY`.

## 5. Relier l'app

Onglet **Recettes** › **⚙️ Sources internet** › coller l'adresse du Worker › **Tester**.
Le test indique si le Worker répond et quelles clés il contient. Cocher ensuite les sources voulues.

Pour ne pas ressaisir l'adresse sur chaque appareil : dépôt GitHub › **Settings** › **Secrets and variables** › **Actions** › **Variables** › `WORKER_URL` = adresse du Worker, puis relancer le déploiement.

## Routes

| Route | Rôle |
|---|---|
| `/` | État : `{ ok, youtube, edamam }` |
| `/recipe?url=` | Recette d'une page (bloc schema.org/Recipe) |
| `/search?site=&q=&tpl=` | Recherche sur un site (`tpl` = adresse de recherche avec `{q}`, sinon DuckDuckGo), puis lecture de 10 pages au plus |
| `/youtube?q=` | Vidéos et leur description complète |
| `/edamam?q=` | Recettes Edamam |

Seule la route `/` répond hors de l'app (origine vérifiée).

## Dépannage

- **« Origine non autorisée »** : l'adresse de l'app n'est pas dans `ALLOWED_ORIGINS`.
- **Un site ne renvoie rien** : son adresse de recherche a changé, ou il bloque les robots. Dans ⚙️ Sources internet, retirer le site puis le rajouter avec la bonne adresse de recherche (faire une recherche sur le site, copier l'adresse de la page de résultats, remplacer le mot cherché par `{q}`).
- **« Aucune recette lisible sur cette page »** : le site ne publie pas de données schema.org/Recipe.
- Journal des appels : Worker › **Logs** › **Begin log stream**.

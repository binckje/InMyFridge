/**
 * InMyFridge — Worker Cloudflare (relais pour les recettes internet).
 *
 * Le navigateur ne peut pas lire les pages d'autres sites (CORS) ni cacher une
 * clé API : ce Worker le fait à sa place. Un seul fichier, sans dépendance :
 * à coller tel quel dans l'éditeur Cloudflare (voir worker/README.md).
 *
 * Routes (GET) :
 *   /                      état : { ok, youtube, edamam }
 *   /recipe?url=           recette d'une page (données schema.org/Recipe)
 *   /search?site=&q=&tpl=  recherche sur un site, puis lecture des recettes trouvées
 *   /youtube?q=            vidéos YouTube avec leur description complète
 *   /edamam?q=             recettes Edamam
 *
 * Variables (Paramètres › Variables et secrets) :
 *   ALLOWED_ORIGINS   adresses de l'app autorisées, séparées par des virgules
 *                     (défaut : https://binckje.github.io ; localhost toujours accepté)
 *   YOUTUBE_KEY       secret — clé « YouTube Data API v3 »
 *   EDAMAM_ID         secret — Application ID Edamam (Recipe Search API)
 *   EDAMAM_KEY        secret — Application Key Edamam
 *   EDAMAM_USER       facultatif — identifiant de compte, si Edamam le réclame
 */

const DEFAULT_ORIGINS = 'https://binckje.github.io';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Pages lues par recherche (limite Cloudflare gratuite : 50 sous-requêtes par appel). */
const MAX_PAGES = 10;

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = isAllowed(origin, env);
    const cors = { 'Access-Control-Allow-Origin': allowed && origin ? origin : 'null', Vary: 'Origin' };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? 'max-age=3600' : 'no-store', ...cors }
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return json({ error: 'Méthode non autorisée.' }, 405);

    const route = url.pathname.replace(/\/+$/, '') || '/';
    if (route === '/') return json({ ok: true, youtube: !!env.YOUTUBE_KEY, edamam: !!(env.EDAMAM_ID && env.EDAMAM_KEY) });
    // Tout le reste coûte du quota : réservé à l'app.
    if (!origin || !allowed) return json({ error: "Origine non autorisée : ajoute l'adresse de l'app à ALLOWED_ORIGINS." }, 403);

    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    try {
      if (route === '/recipe') return json(await recipe(url.searchParams.get('url') ?? ''));
      if (route === '/search') return json(await search(url.searchParams.get('site') ?? '', q, url.searchParams.get('tpl') ?? ''));
      if (route === '/youtube') return json(await youtube(q, env));
      if (route === '/edamam') return json(await edamam(q, env));
      return json({ error: 'Route inconnue.' }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Erreur.' }, e instanceof Refused ? 400 : 502);
    }
  }
};

/** Demande refusée (paramètre invalide, clé absente) : réponse 400. */
class Refused extends Error {}

function isAllowed(origin, env) {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((o) => o.trim().replace(/\/+$/, '')).includes(origin);
}

/* ---------- Pages de sites ---------- */

/** Adresse publique http(s) uniquement (pas d'adresse IP ni de machine locale). */
function publicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Refused('Adresse invalide.');
  }
  const h = u.hostname;
  if (!/^https?:$/.test(u.protocol) || !h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal)$/.test(h))
    throw new Refused('Adresse refusée.');
  return u;
}

async function page(u) {
  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`${u.hostname} a répondu ${res.status}.`);
  return (await res.text()).slice(0, 2_000_000);
}

/** Blocs schema.org de type Recipe présents dans une page (JSON-LD, y compris @graph). */
export function recipesIn(html) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if ([].concat(node['@type'] ?? []).includes('Recipe')) found.push(node);
    else if (node['@graph']) walk(node['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* bloc illisible : ignoré */
    }
  }
  return found;
}

async function recipe(raw) {
  const u = publicUrl(raw);
  const [data] = recipesIn(await page(u));
  if (!data) throw new Error('Aucune recette lisible sur cette page.');
  return { url: u.toString(), recipe: data };
}

const sameSite = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** Liens d'une page vers le même site, les plus « recette » d'abord. */
export function links(html, base, domain, words) {
  const seen = new Map();
  for (const m of html.matchAll(/<a\s[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try {
      u = new URL(m[1].replace(/&amp;/g, '&'), base);
    } catch {
      continue;
    }
    u.hash = '';
    const path = u.pathname.toLowerCase();
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.hostname, domain) || path.length < 8 || u.pathname === base.pathname) continue;
    if (/\.(jpe?g|png|gif|webp|svg|css|js|pdf|xml)$/.test(path)) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').toLowerCase();
    let score = 0;
    if (/recette|recipe/.test(path)) score += 2;
    if (/\d{3,}/.test(path)) score += 1;
    if (words.some((w) => path.includes(w) || text.includes(w))) score += 2;
    if (/recherche|search|categor|rubrique|\/tag|login|compte|newsletter|contact|mentions|cgu|video|diaporama/.test(path)) score -= 4;
    const key = u.toString();
    seen.set(key, Math.max(score, seen.get(key) ?? -99));
  }
  return [...seen].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

/** Recherche de secours : DuckDuckGo limité au site. */
async function duck(domain, q) {
  const html = await page(new URL(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:${domain} recette ${q}`)}`));
  const out = [];
  for (const m of html.matchAll(/uddg=([^&"']+)/g)) {
    try {
      const u = new URL(decodeURIComponent(m[1]));
      if (sameSite(u.hostname, domain) && !out.includes(u.toString())) out.push(u.toString());
    } catch {
      /* lien illisible */
    }
  }
  return out;
}

async function search(site, q, tpl) {
  const domain = site.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  publicUrl(`https://${domain}/`);
  if (!q) throw new Refused('Recherche vide.');
  const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 2);

  let found = [];
  let via = 'site';
  if (tpl) {
    const base = publicUrl(tpl.replace('{q}', encodeURIComponent(q)));
    if (!sameSite(base.hostname, domain)) throw new Refused("L'adresse de recherche n'appartient pas au site.");
    found = await page(base).then((html) => links(html, base, domain, words), () => []);
  }
  if (!found.length) {
    via = 'duckduckgo';
    found = await duck(domain, q).catch(() => []);
  }
  const results = await Promise.all(
    found.slice(0, MAX_PAGES).map(async (u) => {
      try {
        const [data] = recipesIn(await page(new URL(u)));
        return data ? { url: u, recipe: data } : null;
      } catch {
        return null;
      }
    })
  );
  return { via, links: found.length, results: results.filter(Boolean) };
}

/* ---------- YouTube ---------- */

async function api(u, headers = {}) {
  const res = await fetch(u, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? data?.message ?? `Erreur ${res.status}.`);
  return data;
}

async function youtube(q, env) {
  if (!env.YOUTUBE_KEY) throw new Refused('Clé YouTube absente du Worker (YOUTUBE_KEY).');
  if (!q) throw new Refused('Recherche vide.');
  const base = 'https://www.googleapis.com/youtube/v3';
  const key = `key=${encodeURIComponent(env.YOUTUBE_KEY)}`;
  // search (100 unités de quota) ne renvoie qu'un extrait : videos (1 unité) donne la description entière.
  const found = await api(`${base}/search?part=id&type=video&maxResults=8&relevanceLanguage=fr&q=${encodeURIComponent(`recette ${q}`)}&${key}`);
  const ids = (found.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return { items: [] };
  const videos = await api(`${base}/videos?part=snippet&id=${ids.join(',')}&${key}`);
  return {
    items: (videos.items ?? []).map((v) => ({
      id: v.id,
      title: v.snippet?.title ?? '',
      description: v.snippet?.description ?? '',
      channel: v.snippet?.channelTitle ?? '',
      image: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url
    }))
  };
}

/* ---------- Edamam ---------- */

async function edamam(q, env) {
  if (!env.EDAMAM_ID || !env.EDAMAM_KEY) throw new Refused('Clés Edamam absentes du Worker (EDAMAM_ID, EDAMAM_KEY).');
  if (!q) throw new Refused('Recherche vide.');
  const fields = ['uri', 'label', 'image', 'url', 'source', 'yield', 'totalTime', 'ingredients'].map((f) => `field=${f}`).join('&');
  const data = await api(
    `https://api.edamam.com/api/recipes/v2?type=public&q=${encodeURIComponent(q)}&app_id=${encodeURIComponent(env.EDAMAM_ID)}&app_key=${encodeURIComponent(env.EDAMAM_KEY)}&${fields}`,
    env.EDAMAM_USER ? { 'Edamam-Account-User': env.EDAMAM_USER } : {}
  );
  return {
    items: (data.hits ?? []).slice(0, 20).map(({ recipe: r }) => ({
      id: String(r.uri ?? '').split('#recipe_')[1] ?? r.uri,
      name: r.label,
      image: r.image,
      url: r.url,
      source: r.source,
      servings: r.yield,
      time: r.totalTime,
      ingredients: (r.ingredients ?? []).map((i) => ({ food: i.food, quantity: i.quantity, measure: i.measure, text: i.text }))
    }))
  };
}

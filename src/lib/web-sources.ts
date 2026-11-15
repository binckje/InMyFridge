import { isBasic, parseIngredient } from './recipes';
import { parseRecipeText } from './recipe-import';
import { fetchReliable, frenchFood, ideasFromStock, measure, searchWeb, toEnglish, toFrench } from './web-recipes';
import type { Recipe, RecipeIngredient } from './types';

/**
 * Sources de recettes internet : TheMealDB (direct), et via le Worker Cloudflare
 * (worker/worker.js) : sites de recettes (données schema.org), YouTube, Edamam.
 * Les réglages sont propres à l'appareil (localStorage), les clés API restent dans le Worker.
 */

/* ---------- Réglages ---------- */

export interface Site {
  name: string;
  /** Domaine sans « www. » (« cuisineaz.com »). */
  domain: string;
  /** Adresse de la page de recherche du site, « {q} » à la place des mots cherchés (facultatif). */
  search?: string;
  on: boolean;
}

export interface Sources {
  /** Adresse du Worker Cloudflare. */
  worker: string;
  mealdb: boolean;
  youtube: boolean;
  edamam: boolean;
  sites: Site[];
}

const KEY = 'imf.sources';

export const defaultSources = (): Sources => ({
  worker: ((import.meta.env.VITE_WORKER_URL as string | undefined) ?? '').trim(),
  mealdb: true,
  youtube: false,
  edamam: false,
  sites: [
    { name: 'CuisineAZ', domain: 'cuisineaz.com', search: 'https://www.cuisineaz.com/recettes/recherche_terme.aspx?recherche={q}', on: true },
    { name: 'Elle à Table', domain: 'elle.fr', on: true }
  ]
});

export function getSources(): Sources {
  const base = defaultSources();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Sources> | null;
    if (!saved) return base;
    return { ...base, ...saved, worker: (saved.worker ?? '').trim() || base.worker, sites: Array.isArray(saved.sites) ? saved.sites : base.sites };
  } catch {
    return base;
  }
}

export function saveSources(s: Sources) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, worker: s.worker.trim().replace(/\/+$/, '') }));
  } catch {
    /* stockage indisponible */
  }
}

/** « https://www.Marmiton.org/recettes » → « marmiton.org » ; chaîne vide si ce n'est pas un domaine. */
export function cleanDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

/* ---------- Appels au Worker ---------- */

/** Worker non renseigné : à régler dans « Sources internet ». */
export class NoWorker extends Error {
  constructor() {
    super("Adresse du Worker non renseignée (⚙️ Sources internet).");
  }
}

async function call<T>(worker: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const base = worker.trim().replace(/\/+$/, '');
  if (!base) throw new NoWorker();
  const res = await fetch(`${base}/${path}?${new URLSearchParams(params)}`).catch(() => {
    throw new Error('Worker injoignable : vérifie son adresse et la connexion.');
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
  return data as T;
}

/** État du Worker : joignable, et quelles clés API y sont enregistrées. */
export const workerStatus = (worker: string) => call<{ ok: boolean; youtube: boolean; edamam: boolean }>(worker, '');

/* ---------- schema.org/Recipe → recette de l'app ---------- */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', deg: '°', frac12: '½', frac14: '¼', frac34: '¾',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', oelig: 'œ'
};

/** Texte lisible : sans balises ni entités HTML. */
export const plain = (s: string) =>
  s
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .trim();

type Json = Record<string, unknown>;
const list = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
/** Première valeur texte d'un champ schema.org (chaîne, liste, ou objet à url/name/text). */
function str(v: unknown): string {
  const x = list(v)[0];
  if (typeof x === 'string') return plain(x);
  if (typeof x === 'number') return String(x);
  if (x && typeof x === 'object') return str((x as Json).url ?? (x as Json).text ?? (x as Json).name);
  return '';
}

/** Durée ISO 8601 (« PT1H30M ») → minutes. */
export function minutes(v: unknown): number | undefined {
  const m = str(v).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const n = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return n || undefined;
}

/** Étapes : texte, liste de textes, HowToStep ou HowToSection imbriqués. */
function steps(v: unknown): string[] {
  return list(v).flatMap((x) => {
    if (typeof x === 'string') return plain(x).split(/\n+/);
    if (!x || typeof x !== 'object') return [];
    const o = x as Json;
    return o.itemListElement ? steps(o.itemListElement) : steps(o.text ?? o.name);
  });
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/** Bloc schema.org/Recipe (lu par le Worker) → recette au format de l'app, non enregistrée. */
export function fromSchema(data: Json, url: string): Recipe | null {
  const name = str(data.name);
  const ingredients = list(data.recipeIngredient ?? data.ingredients)
    .filter((i): i is string => typeof i === 'string')
    .map((i) => plain(i))
    .filter(Boolean)
    .map(parseIngredient);
  if (!name || !ingredients.length) return null;
  const servings = +(list(data.recipeYield).map(String).join(' ').match(/\d+/)?.[0] ?? 0) || 4;
  const prepTime = minutes(data.prepTime);
  const cookTime = minutes(data.cookTime);
  const video = (list(data.video)[0] ?? {}) as Json;
  return {
    id: `site-${hash(url)}`,
    name: name.slice(0, 80),
    emoji: '🌐',
    servings,
    time: minutes(data.totalTime) ?? ((prepTime ?? 0) + (cookTime ?? 0) || undefined),
    prepTime,
    cookTime,
    tags: [],
    ingredients,
    steps: steps(data.recipeInstructions).map((s) => s.trim()).filter((s) => s.length > 2),
    source: 'web',
    url,
    image: str(data.image) || undefined,
    video: str(video.embedUrl ?? video.contentUrl) || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/* ---------- Sites ---------- */

interface Page {
  url: string;
  recipe: Json;
}

/** Recette d'une page internet (n'importe quel site publiant des données schema.org). */
export async function importUrl(url: string, s = getSources()): Promise<Recipe> {
  const { url: final, recipe } = await call<Page>(s.worker, 'recipe', { url: url.trim() });
  const r = fromSchema(recipe, final);
  if (!r) throw new Error('Recette illisible sur cette page.');
  return r;
}

async function searchSite(site: Site, q: string, worker: string): Promise<Recipe[]> {
  const { results } = await call<{ results: Page[] }>(worker, 'search', { site: site.domain, q, ...(site.search ? { tpl: site.search } : {}) });
  return results.map((p) => fromSchema(p.recipe, p.url)).filter((r): r is Recipe => !!r);
}

/* ---------- YouTube ---------- */

export interface Video {
  id: string;
  title: string;
  description: string;
  channel?: string;
  image?: string;
}

/**
 * Vidéo → recette, seulement si la description contient une liste d'ingrédients
 * annoncée (« Ingrédients : ») : sinon rien de fiable à comparer au stock.
 */
export function fromVideo(v: Video): Recipe | null {
  const lines = v.description.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => /^\W*ingr[ée]dients?\b/i.test(l));
  if (start < 0) return null;
  // Liens, mots-dièse et réseaux sociaux : hors recette
  const useful = lines.slice(start).filter((l) => !/https?:\/\/|www\.|^[#@]|abonne|instagram|facebook|tiktok/i.test(l));
  const parsed = parseRecipeText(`${v.title}\n${useful.join('\n')}`);
  const ingredients = parsed.ingredients.filter((i) => i.section || (i.name.length <= 60 && /[a-zà-ÿ]{2}/i.test(i.name)));
  if (ingredients.filter((i) => !i.section).length < 2) return null;
  const link = `https://www.youtube.com/watch?v=${v.id}`;
  return {
    ...parsed,
    id: `yt-${v.id}`,
    name: plain(v.title).slice(0, 80),
    emoji: '▶️',
    ingredients,
    source: 'web',
    url: link,
    video: link,
    image: v.image,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function searchYoutube(q: string, worker: string): Promise<Recipe[]> {
  const { items } = await call<{ items: Video[] }>(worker, 'youtube', { q });
  return items.map(fromVideo).filter((r): r is Recipe => !!r);
}

/* ---------- Edamam (en anglais : ingrédients traduits) ---------- */

export interface EdamamItem {
  id: string;
  name: string;
  image?: string;
  url?: string;
  servings?: number;
  time?: number;
  ingredients: { food?: string; quantity?: number; measure?: string | null; text?: string }[];
}

const EDAMAM_UNITS: Record<string, string> = {
  gram: 'g', kilogram: 'kg', milliliter: 'ml', liter: 'l', ounce: 'oz', pound: 'lb', cup: 'cup', tablespoon: 'tbsp', teaspoon: 'tsp',
  clove: 'clove', pinch: 'pinch', slice: 'slice', sprig: 'sprig', bunch: 'bunch', handful: 'handful', can: 'can', dash: 'dash', stick: 'stick', leaf: 'leaf'
};

/** Recette Edamam → recette de l'app ; null si un ingrédient n'est pas traduisible (manquants incertains). */
export function fromEdamam(e: EdamamItem): Recipe | null {
  const ingredients: RecipeIngredient[] = [];
  for (const i of e.ingredients) {
    const name = frenchFood(i.food ?? '');
    if (!name) return null;
    const unit = EDAMAM_UNITS[(i.measure ?? '').toLowerCase()] ?? '';
    const q = i.quantity ? measure(`${Math.round(i.quantity * 100) / 100} ${unit}`) : {};
    if (!ingredients.some((x) => x.name === name)) ingredients.push({ name, ...q });
  }
  if (ingredients.length < 3) return null;
  return {
    id: `edamam-${e.id}`,
    name: e.name,
    emoji: '🌐',
    servings: Math.round(e.servings ?? 0) || 4,
    time: e.time || undefined,
    tags: [],
    ingredients,
    steps: [],
    source: 'web',
    url: e.url,
    image: e.image,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function searchEdamam(q: string, worker: string): Promise<Recipe[]> {
  const { items } = await call<{ items: EdamamItem[] }>(worker, 'edamam', { q });
  return items.map(fromEdamam).filter((r): r is Recipe => !!r);
}

/* ---------- Recherche unifiée ---------- */

export interface WebResult {
  recipes: Recipe[];
  /** Sources en échec, avec la raison (« YouTube : quota dépassé »). */
  errors: string[];
}

/** Nom affiché de la source d'une recette internet. */
export function sourceLabel(r: Recipe, s = getSources()): string {
  if (r.id.startsWith('web-')) return 'TheMealDB';
  if (r.id.startsWith('yt-')) return 'YouTube';
  if (r.id.startsWith('edamam-')) return 'Edamam';
  try {
    const host = new URL(r.url ?? '').hostname.replace(/^www\./, '');
    return s.sites.find((x) => host === x.domain || host.endsWith(`.${x.domain}`))?.name ?? host;
  } catch {
    return 'Internet';
  }
}

async function gather(jobs: [string, () => Promise<Recipe[]>][]): Promise<WebResult> {
  const done = await Promise.allSettled(jobs.map(([, run]) => run()));
  const recipes: Recipe[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  done.forEach((d, i) => {
    if (d.status === 'rejected') {
      const why = d.reason instanceof Error && d.reason.message.length < 140 ? d.reason.message : 'injoignable';
      if (!errors.includes(`${jobs[i][0]} : ${why}`)) errors.push(`${jobs[i][0]} : ${why}`);
    } else for (const r of d.value) if (!seen.has(r.id) && seen.add(r.id)) recipes.push(r);
  });
  return { recipes, errors };
}

/** Anglais pour Edamam : chaque mot traduit quand c'est un ingrédient connu. */
const english = (q: string) => toEnglish(q) ?? q;

/** Cherche un plat ou un ingrédient sur toutes les sources activées. */
export function searchAll(query: string, s = getSources()): Promise<WebResult> {
  const jobs: [string, () => Promise<Recipe[]>][] = [];
  if (s.mealdb) jobs.push(['TheMealDB', async () => fetchReliable(await searchWeb(query))]);
  for (const site of s.sites) if (site.on) jobs.push([site.name, () => searchSite(site, query, s.worker)]);
  if (s.youtube) jobs.push(['YouTube', () => searchYoutube(query, s.worker)]);
  if (s.edamam) jobs.push(['Edamam', () => searchEdamam(english(query), s.worker)]);
  return gather(jobs);
}

/**
 * Idées à partir du stock. TheMealDB parcourt tout le stock ; les autres sources
 * sont interrogées sur quelques produits tirés au hasard (une recherche coûte
 * du quota) : relancer donne d'autres idées. Renvoie aussi les produits utilisés.
 */
export async function ideasAll(names: string[], s = getSources(), random = Math.random): Promise<WebResult & { picked: string[] }> {
  // Nom générique : « Blanc de poulet fermier » → poulet
  const generic = [...new Set(names.filter((n) => !isBasic(n)).map((n) => toEnglish(n)).filter((e): e is string => !!e))];
  for (let i = generic.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [generic[i], generic[j]] = [generic[j], generic[i]];
  }
  const en = generic.slice(0, 2);
  const fr = en.map(toFrench);
  const jobs: [string, () => Promise<Recipe[]>][] = [];
  if (s.mealdb) jobs.push(['TheMealDB', async () => fetchReliable(await ideasFromStock(names))]);
  if (fr.length) {
    for (const site of s.sites) if (site.on) for (const q of fr) jobs.push([site.name, () => searchSite(site, q, s.worker)]);
    if (s.youtube) jobs.push(['YouTube', () => searchYoutube(fr.join(' '), s.worker)]);
    if (s.edamam) jobs.push(['Edamam', () => searchEdamam(en.join(' '), s.worker)]);
  }
  return { ...(await gather(jobs)), picked: jobs.length > (s.mealdb ? 1 : 0) ? fr : [] };
}

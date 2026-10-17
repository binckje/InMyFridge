import { db, newId } from './db';
import { addItem } from './shopping';
import { updateStock } from './stock';
import { SEED_RECIPES } from './recipes-seed';
import type { Recipe, RecipeIngredient, StockItem, Unit } from './types';

/* ---------- Normalisation des noms ---------- */

const STOP = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'a', 'au', 'aux', 'en', 'et', 'un', 'une']);

/** Noms composés à ne pas confondre avec leur premier mot (« pomme de terre » ≠ « pomme »). */
const COMPOUNDS = [
  'pomme de terre',
  'fromage blanc',
  'lait de coco',
  'noix de coco',
  'creme de coco',
  'petit pois',
  'haricot vert',
  'haricot rouge',
  'pois chiche',
  'sucre vanille',
  'pate brisee',
  'pate feuilletee',
  'pate sablee',
  'pate a pizza',
  'jus de citron',
  'concentre de tomate',
  'coulis de tomate',
  'sauce tomate',
  'creme fraiche',
  'creme liquide',
  'chocolat noir',
  'chocolat au lait',
  'chocolat blanc'
];

const singular = (w: string) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

const base = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(singular)
    .join(' ');

/** Mots significatifs d'un nom (pluriels ramenés au singulier, noms composés soudés). */
export function tokens(name: string): string[] {
  let s = ` ${base(name)} `;
  for (const c of COMPOUNDS) {
    const k = c.split(' ').map(singular).join(' ');
    s = s.replace(` ${k} `, ` ${k.replace(/ /g, '_')} `);
  }
  return s.split(/\s+/).filter((w) => w && !STOP.has(w));
}

/** Produits précis → nom générique utilisé dans les recettes (« spaghetti » est une sorte de « pâtes »). */
const KIND_OF: Record<string, string[]> = {
  spaghetti: ['pate'], penne: ['pate'], tagliatelle: ['pate'], coquillette: ['pate'], fusilli: ['pate'],
  macaroni: ['pate'], farfalle: ['pate'], linguine: ['pate'], torsade: ['pate'], nouille: ['pate'],
  basmati: ['riz'], thai: ['riz'], arborio: ['riz'],
  emmental: ['fromage'], gruyere: ['fromage'], comte: ['fromage'], mozzarella: ['fromage'], cheddar: ['fromage'],
  parmesan: ['fromage'], raclette: ['fromage'], reblochon: ['fromage'], chevre: ['fromage'], feta: ['fromage'],
  ricotta: ['fromage'],
  steak: ['boeuf'], entrecote: ['boeuf'], bavette: ['boeuf'],
  baguette: ['pain'],
  cebette: ['oignon'],
  poitrine: ['lardon'],
  tournesol: ['huile'], colza: ['huile'],
  cassonade: ['sucre', 'rou'], vergeoise: ['sucre', 'rou']
};

/** Mots de précision sans effet sur le produit (« farine de blé », « sucre en poudre »). */
const IGNORED = new Set(['ble', 'poudre']);

/**
 * Variantes interchangeables en cuisine : si seuls ces mots diffèrent, le produit du stock
 * peut remplacer l'ingrédient (sucre roux ⇄ cassonade ⇄ sucre, farine T45 ⇄ farine T55…).
 */
const VARIANTS: Record<string, Set<string>> = {
  sucre: new Set(['rou' /* roux, après singulier */, 'blanc', 'semoule', 'glace', 'cassonade', 'vergeoise', 'complet', 'canne', 'blond', 'brun', 'cristal']),
  farine: new Set(['t45', 't55', 't65', 't80', 't110', 't150', 'fluide', 'complete', 'patissiere', 'gateau', 'pain'])
};

/** Mots de l'ingrédient, avec le nom générique d'une variante (« cassonade » → sucre + cassonade). */
const ingWords = (name: string) =>
  [...new Set(tokens(name).filter((w) => !IGNORED.has(w)).flatMap((w) => [...(KIND_OF[w] ?? []).filter((k) => VARIANTS[k]), w]))];

export type MatchKind = 'exact' | 'substitute';

/**
 * Correspondance produit du stock ↔ ingrédient :
 * exact = tous les mots de l'ingrédient figurent dans le produit ;
 * substitute = même produit de base, seule la variante diffère (sucre roux demandé, sucre en stock).
 */
export function matchKind(ingredient: string, stockName: string): MatchKind | undefined {
  const ing = ingWords(ingredient);
  const st = new Set(tokens(stockName).flatMap((w) => [w, ...(KIND_OF[w] ?? [])]));
  if (!ing.length) return undefined;
  const miss = ing.filter((w) => !st.has(w));
  if (!miss.length) return 'exact';
  const head = ing.find((w) => VARIANTS[w] && st.has(w));
  return head && miss.every((w) => VARIANTS[head].has(w)) ? 'substitute' : undefined;
}

/** Le produit du stock peut servir pour l'ingrédient (exactement ou en remplacement). */
export const matches = (ingredient: string, stockName: string): boolean => !!matchKind(ingredient, stockName);

/** Toujours considérés comme disponibles. */
const BASICS = new Set(['sel', 'poivre', 'eau', 'sel poivre']);
export const isBasic = (name: string) => BASICS.has(tokens(name).join(' '));

/* ---------- Unités ---------- */

const FACTOR: Partial<Record<string, { dim: 'm' | 'v' | 'n'; f: number }>> = {
  g: { dim: 'm', f: 1 },
  kg: { dim: 'm', f: 1000 },
  ml: { dim: 'v', f: 1 },
  cl: { dim: 'v', f: 10 },
  l: { dim: 'v', f: 1000 },
  pièce: { dim: 'n', f: 1 }
};

const toBase = (qty: number, unit?: string) => {
  const u = FACTOR[unit ?? 'pièce'];
  return u ? { dim: u.dim, v: qty * u.f } : undefined;
};

/** Cuillères, ramenées à une unité unique. */
const SPOON_ML: Record<string, number> = { 'c. à s.': 15, 'c. à c.': 5 };
const spoonUnit = (u: string) =>
  /^(c\.? ?à ?s|cs$|cuill(?:ère|ere)s? à soupe)/i.test(u) ? 'c. à s.' : /^(c\.? ?à ?c|cc$|cuill(?:ère|ere)s? à café)/i.test(u) ? 'c. à c.' : u;

/** Poids approximatif d'une cuillère à soupe rase, en grammes (cuillère à café = 1/3). */
const SPOON_G: Record<string, number> = {
  sucre: 12, farine: 10, beurre: 15, cacao: 8, maizena: 10, fecule: 10, sel: 15, miel: 20, levure: 10,
  riz: 12, semoule: 12, amande: 8, noisette: 8, poivre: 6, cannelle: 8, huile: 13, confiture: 20, moutarde: 15
};

/**
 * Quantité nécessaire exprimée dans la dimension d'un produit du stock (g, ml ou pièces).
 * Les cuillères se convertissent en ml, ou en g pour les produits courants. Inconvertible → undefined.
 */
function needIn(ing: RecipeIngredient, scale: number, dim: 'm' | 'v' | 'n'): number | undefined {
  if (ing.qty == null) return undefined;
  const qty = ing.qty * scale;
  const ml = ing.unit ? SPOON_ML[spoonUnit(ing.unit)] : undefined;
  if (ml) {
    if (dim === 'v') return qty * ml;
    const g = dim === 'm' && ingWords(ing.name).map((w) => SPOON_G[w]).find(Boolean);
    return g ? (qty * g * ml) / 15 : undefined;
  }
  const b = toBase(qty, ing.unit);
  return b?.dim === dim ? b.v : undefined;
}

const UNIT_RE =
  '(kg|g|ml|cl|l|c\\.? ?à ?s(?:oupe)?\\.?|c\\.? ?à ?c(?:afé)?\\.?|cs|cc|cuill(?:ère|ere)s? à (?:soupe|café)|pincées?|sachets?|cubes?|pavés?|tranches?|gousses?|boîtes?|brins?|feuilles?|verres?|bols?|filets?|morceaux?|noix|botte?s?)';

/** « 200 g de farine », « 3 oeufs », « 1 c. à soupe d'huile », « sel » → ingrédient structuré. */
export function parseIngredient(line: string): RecipeIngredient {
  let s = line.trim().replace(/\s+/g, ' ');
  const optional = /\((?:facultatif|optionnel)\)/i.test(s);
  s = s.replace(/\((?:facultatif|optionnel)\)/i, '').trim();
  const m = s.match(new RegExp(`^(\\d+(?:[.,/]\\d+)?)\\s*(?:${UNIT_RE}(?=[\\s'’]|$))?\\s*(?:de |d['’])?(.+)$`, 'i'));
  let out: RecipeIngredient;
  if (m) {
    const [, n, unit, name] = m;
    const qty = n.includes('/') ? +n.split('/')[0] / +n.split('/')[1] : +n.replace(',', '.');
    const u = unit?.toLowerCase();
    out = { name: name.trim(), qty, unit: u && FACTOR[u] ? (u as Unit) : (u ?? 'pièce') };
  } else {
    out = { name: s };
  }
  if (optional) out.optional = true;
  return out;
}

export const formatIngredient = (i: RecipeIngredient, scale = 1): string => {
  if (i.qty == null) return i.name;
  const q = Math.round(i.qty * scale * 100) / 100;
  const n = String(q).replace('.', ',');
  if (!i.unit || i.unit === 'pièce') return `${n} ${i.name}`;
  const de = /^[aeiouyhéèêâ]/i.test(i.name) ? "d'" : 'de ';
  return `${n} ${i.unit} ${FACTOR[i.unit] ? '' : de}${i.name}`.replace(/ {2,}/g, ' ');
};

/* ---------- Stock → recette ---------- */

export type Status = 'ok' | 'low' | 'missing' | 'basic';

export interface IngredientCheck {
  ingredient: RecipeIngredient;
  status: Status;
  /** Produits utilisables, le meilleur d'abord (correspondance exacte, puis le plus de stock). */
  stock: StockItem[];
  /** Le meilleur produit n'est qu'un remplacement (sucre en stock pour du sucre roux). */
  substitute?: boolean;
}

export interface RecipeCheck {
  recipe: Recipe;
  checks: IngredientCheck[];
  /** Ingrédients non facultatifs absents ou en quantité insuffisante. */
  missing: IngredientCheck[];
  feasible: boolean;
  /** Part des ingrédients disponibles (0 → 1). */
  score: number;
}

export function checkIngredient(ing: RecipeIngredient, stock: StockItem[], scale = 1): IngredientCheck {
  if (isBasic(ing.name)) return { ingredient: ing, status: 'basic', stock: [] };
  const kind = new Map<StockItem, MatchKind>();
  for (const s of stock) {
    const k = !s.deleted && matchKind(ing.name, s.name);
    if (k) kind.set(s, k);
  }
  const found = [...kind.keys()];
  if (!found.length) return { ingredient: ing, status: 'missing', stock: [] };
  const present = found
    .filter((s) => (s.level ? true : (s.qty ?? 0) > 0))
    .sort((a, b) => +(kind.get(a) !== 'exact') - +(kind.get(b) !== 'exact') || amountOf(b) - amountOf(a));
  if (!present.length) return { ingredient: ing, status: 'missing', stock: found };
  const substitute = kind.get(present[0]) === 'substitute' || undefined;
  if (present.every((s) => s.level === 'plus beaucoup')) return { ingredient: ing, status: 'low', stock: present, substitute };
  if (ing.qty != null && !present.some((s) => s.level)) {
    // quantité disponible par dimension (g, ml, pièces) comparée au besoin converti
    const have = new Map<string, { have: number; need: number }>();
    for (const s of present) {
      const u = toBase(1, s.unit);
      const need = u && needIn(ing, scale, u.dim);
      if (!u || need == null) continue;
      const t = have.get(u.dim) ?? { have: 0, need };
      t.have += (s.qty ?? 0) * u.v;
      have.set(u.dim, t);
    }
    if (have.size && [...have.values()].every((t) => t.have < t.need - 1e-9)) return { ingredient: ing, status: 'low', stock: present, substitute };
  }
  return { ingredient: ing, status: 'ok', stock: present, substitute };
}

const LEVEL_RANK = { suffisamment: 3, moyen: 2, 'plus beaucoup': 1 } as const;
/** Pour trier les produits : niveau ou quantité dans l'unité de base. */
const amountOf = (s: StockItem) => (s.level ? LEVEL_RANK[s.level] * 1e9 : (toBase(s.qty ?? 0, s.unit)?.v ?? 0));

/** Quantité seule, pour la liste de courses (« 200 g », « 2 c. à s. », « 3 »). */
export function qtyLabel(i: RecipeIngredient, scale = 1): string {
  if (i.qty == null) return '';
  const n = String(Math.round(i.qty * scale * 100) / 100).replace('.', ',');
  return !i.unit || i.unit === 'pièce' ? n : `${n} ${i.unit}`;
}

export function checkRecipe(recipe: Recipe, stock: StockItem[], scale = 1): RecipeCheck {
  const checks = recipe.ingredients.map((i) => checkIngredient(i, stock, scale));
  const counted = checks.filter((c) => !c.ingredient.optional && c.status !== 'basic');
  const missing = counted.filter((c) => c.status === 'missing' || c.status === 'low');
  const have = counted.filter((c) => c.status === 'ok').length;
  return {
    recipe,
    checks,
    missing,
    feasible: missing.length === 0,
    score: counted.length ? have / counted.length : 1
  };
}

/** Recettes triées : faisables d'abord, puis par nombre de manquants, puis par note. */
export function rank(recipes: Recipe[], stock: StockItem[]): RecipeCheck[] {
  return recipes
    .filter((r) => !r.deleted)
    .map((r) => checkRecipe(r, stock))
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        b.score - a.score ||
        (b.recipe.rating ?? 0) - (a.recipe.rating ?? 0) ||
        a.recipe.name.localeCompare(b.recipe.name, 'fr')
    );
}

/* ---------- Actions ---------- */

/** Ajoute à la liste de courses les ingrédients manquants ou insuffisants. Retourne le nombre ajouté. */
export async function addMissingToShopping(check: RecipeCheck, scale = 1): Promise<number> {
  for (const c of check.missing) {
    const i = c.ingredient;
    await addItem(i.name, qtyLabel(i, scale));
  }
  return check.missing.length;
}

export interface Consumption {
  id: string;
  before: Partial<StockItem>;
}

/**
 * « J'ai cuisiné » : retire du stock les quantités utilisées (unités compatibles),
 * descend d'un niveau les produits suivis par niveau. Retourne de quoi annuler.
 */
export async function cook(check: RecipeCheck, scale = 1, choice: Record<number, string> = {}): Promise<Consumption[]> {
  const done: Consumption[] = [];
  for (const [n, c] of check.checks.entries()) {
    // relu en base : deux ingrédients peuvent viser le même produit (« 2 oeufs » + « 1 oeuf »)
    const id = choice[n] ?? c.stock[0]?.id;
    const s = id && (await db.stock.get(id));
    if (!s || c.status === 'basic' || c.ingredient.optional) continue;
    if (s.level) {
      const next = s.level === 'suffisamment' ? 'moyen' : 'plus beaucoup';
      if (next !== s.level) {
        done.push({ id: s.id, before: { level: s.level } });
        await updateStock(s.id, { level: next });
      }
      continue;
    }
    const unit = toBase(1, s.unit);
    const need = unit && needIn(c.ingredient, scale, unit.dim);
    if (!unit || need == null || s.qty == null) continue;
    const qty = Math.max(0, Math.round((s.qty - need / unit.v) * 1000) / 1000);
    done.push({ id: s.id, before: { qty: s.qty } });
    await updateStock(s.id, { qty });
  }
  return done;
}

export async function undoCook(done: Consumption[]) {
  for (const d of [...done].reverse()) await updateStock(d.id, d.before);
}

export async function saveRecipe(r: Omit<Recipe, 'id' | 'updatedAt' | 'createdAt'> & { id?: string }) {
  const now = Date.now();
  if (r.id && (await db.recipes.get(r.id))) {
    await db.recipes.update(r.id, { ...r, updatedAt: now });
    return r.id;
  }
  const id = r.id ?? newId();
  await db.recipes.put({ ...r, id, createdAt: now, updatedAt: now } as Recipe);
  return id;
}

export const rateRecipe = (id: string, rating: number) => db.recipes.update(id, { rating, updatedAt: Date.now() });

/* ---------- Catégories : portées par une étiquette (synchronisée comme les autres) ---------- */

export const CATEGORIES = [
  { key: 'entrée', label: 'Entrées', emoji: '🥗' },
  { key: 'plat', label: 'Plats', emoji: '🍲' },
  { key: 'dessert', label: 'Desserts', emoji: '🍰' },
  { key: 'autre', label: 'Autres', emoji: '🍽️' }
] as const;
export type Category = (typeof CATEGORIES)[number]['key'];

const plain = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const categoryKey = (t: string) => CATEGORIES.find((c) => plain(c.key) === plain(t))?.key;

/** Catégorie d'une recette : première étiquette « entrée », « plat », « dessert » ou « autre ». */
export const categoryOf = (tags: string[] = []): Category | undefined =>
  tags.map(categoryKey).find((k) => k !== undefined);

/** Remplace l'étiquette de catégorie (une seule à la fois), en tête de liste ; `undefined` la retire. */
export const withCategory = (tags: string[] = [], cat?: Category): string[] => [
  ...(cat ? [cat] : []),
  ...tags.filter((t) => !categoryKey(t))
];

export async function setCategory(ids: string[], cat?: Category) {
  const now = Date.now();
  await db.transaction('rw', db.recipes, async () => {
    for (const id of ids) {
      const r = await db.recipes.get(id);
      if (r) await db.recipes.update(id, { tags: withCategory(r.tags, cat), updatedAt: now });
    }
  });
}

export async function deleteRecipe(id: string) {
  await db.videos.delete(id);
  await db.recipes.update(id, { deleted: true, updatedAt: Date.now() });
}

/**
 * Installe les recettes de base (identifiants fixes : pas de doublon entre appareils
 * à la synchro ; une recette supprimée n'est pas réinstallée).
 */
export async function seedRecipes() {
  const existing = new Set((await db.recipes.toCollection().primaryKeys()) as string[]);
  const todo = SEED_RECIPES.filter((r) => !existing.has(r.id));
  if (!todo.length) return;
  await db.recipes.bulkAdd(
    todo.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      servings: r.servings,
      yieldUnit: r.yieldUnit,
      time: r.time,
      tags: r.tags,
      ingredients: r.ingredients.map(parseIngredient),
      steps: r.steps,
      source: 'base' as const,
      createdAt: 0,
      updatedAt: 0
    }))
  );
}

/** « 4 pers. », « 20 cookies », « 1 cookie ». */
export function yieldLabel(n: number, unit?: string): string {
  if (!unit) return `${n} pers.`;
  return `${n} ${n > 1 ? unit : unit.replace(/s$/, '')}`;
}

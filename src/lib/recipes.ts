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
  cassonade: ['sucre'], vergeoise: ['sucre']
};

/** Le produit du stock correspond à l'ingrédient si tous les mots de l'ingrédient y figurent. */
export function matches(ingredient: string, stockName: string): boolean {
  const ing = tokens(ingredient);
  const st = new Set(tokens(stockName).flatMap((w) => [w, ...(KIND_OF[w] ?? [])]));
  return ing.length > 0 && ing.every((w) => st.has(w));
}

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
  stock: StockItem[];
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
  const found = stock.filter((s) => !s.deleted && matches(ing.name, s.name));
  if (!found.length) return { ingredient: ing, status: 'missing', stock: [] };
  const present = found.filter((s) => (s.level ? true : (s.qty ?? 0) > 0));
  if (!present.length) return { ingredient: ing, status: 'missing', stock: found };
  if (present.every((s) => s.level === 'plus beaucoup')) return { ingredient: ing, status: 'low', stock: present };
  const need = ing.qty != null ? toBase(ing.qty * scale, ing.unit) : undefined;
  if (need && !present.some((s) => s.level)) {
    const have = present
      .map((s) => toBase(s.qty ?? 0, s.unit))
      .filter((b) => b?.dim === need.dim)
      .reduce((t, b) => t + b!.v, 0);
    const comparable = present.some((s) => toBase(1, s.unit)?.dim === need.dim);
    if (comparable && have < need.v - 1e-9) return { ingredient: ing, status: 'low', stock: present };
  }
  return { ingredient: ing, status: 'ok', stock: present };
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
    const qty = i.qty != null && (!i.unit || FACTOR[i.unit]) ? formatIngredient(i, scale).replace(` ${i.name}`, '') : '';
    await addItem(i.name, qty);
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
export async function cook(check: RecipeCheck, scale = 1): Promise<Consumption[]> {
  const done: Consumption[] = [];
  for (const c of check.checks) {
    // relu en base : deux ingrédients peuvent viser le même produit (« 2 oeufs » + « 1 oeuf »)
    const s = c.stock[0] && (await db.stock.get(c.stock[0].id));
    if (!s || c.status === 'basic' || c.ingredient.optional) continue;
    if (s.level) {
      const next = s.level === 'suffisamment' ? 'moyen' : 'plus beaucoup';
      if (next !== s.level) {
        done.push({ id: s.id, before: { level: s.level } });
        await updateStock(s.id, { level: next });
      }
      continue;
    }
    const i = c.ingredient;
    const need = i.qty != null ? toBase(i.qty * scale, i.unit) : undefined;
    const unit = toBase(1, s.unit);
    if (!need || !unit || unit.dim !== need.dim || s.qty == null) continue;
    const qty = Math.max(0, Math.round((s.qty - need.v / unit.v) * 1000) / 1000);
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

export const deleteRecipe = (id: string) => db.recipes.update(id, { deleted: true, updatedAt: Date.now() });

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

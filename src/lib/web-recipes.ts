import { parseIngredient, tokens } from './recipes';
import type { Recipe, RecipeIngredient } from './types';

/**
 * Recettes sur internet : TheMealDB (gratuit, sans compte, accessible depuis le navigateur).
 * Les recettes sont en anglais : les ingrédients sont traduits pour pouvoir
 * les comparer au stock ; le texte des étapes reste en anglais.
 */
const API = 'https://www.themealdb.com/api/json/v1/1';

/** Anglais → français (ingrédients courants). */
const EN_FR: Record<string, string> = {
  'all purpose flour': 'farine', 'plain flour': 'farine', flour: 'farine', 'self-raising flour': 'farine',
  sugar: 'sucre', 'caster sugar': 'sucre', 'brown sugar': 'sucre', 'granulated sugar': 'sucre', 'icing sugar': 'sucre glace',
  salt: 'sel', pepper: 'poivre', 'black pepper': 'poivre', water: 'eau',
  butter: 'beurre', 'unsalted butter': 'beurre', milk: 'lait', egg: 'oeufs', eggs: 'oeufs', 'egg yolks': 'oeufs', 'egg white': 'oeufs',
  'double cream': 'crème liquide', 'heavy cream': 'crème liquide', 'single cream': 'crème liquide', 'creme fraiche': 'crème fraîche', 'sour cream': 'crème fraîche',
  cheese: 'fromage', 'cheddar cheese': 'cheddar', parmesan: 'parmesan', 'parmesan cheese': 'parmesan', mozzarella: 'mozzarella', 'feta': 'feta', 'gruyère': 'gruyère',
  yogurt: 'yaourt', 'greek yogurt': 'yaourt',
  'olive oil': 'huile', oil: 'huile', 'vegetable oil': 'huile', 'sunflower oil': 'huile',
  onion: 'oignon', onions: 'oignon', 'red onions': 'oignon', 'red onion': 'oignon', shallots: 'échalote', shallot: 'échalote',
  garlic: 'ail', 'garlic clove': 'ail', 'garlic cloves': 'ail',
  tomato: 'tomates', tomatoes: 'tomates', 'chopped tomatoes': 'tomates concassées', 'tomato puree': 'concentré de tomate', 'tomato paste': 'concentré de tomate', 'passata': 'coulis de tomate',
  carrot: 'carottes', carrots: 'carottes', potato: 'pommes de terre', potatoes: 'pommes de terre', 'sweet potato': 'patate douce',
  courgette: 'courgettes', zucchini: 'courgettes', aubergine: 'aubergine', eggplant: 'aubergine',
  'red pepper': 'poivrons', 'green pepper': 'poivrons', 'bell pepper': 'poivrons', 'yellow pepper': 'poivrons',
  mushrooms: 'champignons', mushroom: 'champignons', spinach: 'épinards', leek: 'poireau', celery: 'céleri', cucumber: 'concombre',
  lettuce: 'salade', cabbage: 'chou', broccoli: 'brocoli', 'green beans': 'haricots verts', peas: 'petits pois',
  lemon: 'citron', 'lemon juice': 'jus de citron', lime: 'citron vert', apple: 'pommes', apples: 'pommes', banana: 'bananes', bananas: 'bananes',
  strawberries: 'fraises', raspberries: 'framboises', orange: 'orange', avocado: 'avocat',
  chicken: 'poulet', 'chicken breast': 'poulet', 'chicken breasts': 'poulet', 'chicken thighs': 'poulet', 'chicken legs': 'poulet',
  beef: 'boeuf', 'minced beef': 'boeuf haché', 'ground beef': 'boeuf haché', 'beef brisket': 'boeuf', pork: 'porc', 'pork chops': 'porc',
  lamb: 'agneau', 'minced lamb': 'agneau', bacon: 'lardons', ham: 'jambon', sausages: 'saucisses', sausage: 'saucisses', chorizo: 'chorizo',
  salmon: 'saumon', tuna: 'thon', prawns: 'crevettes', shrimp: 'crevettes', cod: 'cabillaud', 'white fish': 'poisson',
  rice: 'riz', 'basmati rice': 'riz', 'long grain rice': 'riz', 'arborio rice': 'riz', pasta: 'pâtes', spaghetti: 'spaghetti', penne: 'pâtes', 'penne rigate': 'pâtes', noodles: 'nouilles', lasagne: 'pâtes', 'lasagne sheets': 'pâtes',
  bread: 'pain', breadcrumbs: 'chapelure', 'puff pastry': 'pâte feuilletée', 'shortcrust pastry': 'pâte brisée',
  lentils: 'lentilles', 'red lentils': 'lentilles', chickpeas: 'pois chiches', 'kidney beans': 'haricots rouges',
  'chicken stock': 'bouillon', 'beef stock': 'bouillon', 'vegetable stock': 'bouillon', stock: 'bouillon',
  'coconut milk': 'lait de coco', honey: 'miel', 'dark chocolate': 'chocolat noir', chocolate: 'chocolat', 'cocoa': 'cacao', 'cocoa powder': 'cacao',
  'baking powder': 'levure', yeast: 'levure', vanilla: 'vanille', 'vanilla extract': 'vanille',
  'soy sauce': 'sauce soja', mustard: 'moutarde', 'dijon mustard': 'moutarde', vinegar: 'vinaigre', 'white wine': 'vin blanc', 'red wine': 'vin rouge',
  cumin: 'cumin', paprika: 'paprika', 'curry powder': 'curry', cinnamon: 'cannelle', nutmeg: 'muscade', thyme: 'thym', 'bay leaf': 'laurier', 'bay leaves': 'laurier',
  parsley: 'persil', basil: 'basilic', coriander: 'coriandre', 'chilli powder': 'piment', chilli: 'piment', ginger: 'gingembre', oregano: 'origan', rosemary: 'romarin'
};

/** Français → anglais : premier terme anglais simple rencontré (« pâtes » → pasta). */
const FR_EN: Record<string, string> = {};
for (const [en, fr] of Object.entries(EN_FR)) {
  const k = tokens(fr).join(' ');
  if (!(k in FR_EN) && (!en.includes(' ') || en === 'minced beef')) FR_EN[k] = en;
}

/** Traduction d'un ingrédient anglais (inconnu → laissé tel quel). */
export const toFrench = (en: string) => EN_FR[en.trim().toLowerCase()] ?? en.trim().toLowerCase();

/** Ingrédient français → anglais, pour chercher par ingrédient. */
export function toEnglish(fr: string): string | undefined {
  const t = tokens(fr);
  for (let n = t.length; n > 0; n--) {
    const hit = FR_EN[t.slice(0, n).join(' ')];
    if (hit) return hit;
  }
}

/** Mesures anglaises → quantité (« 200g », « 1 cup », « 2 tbsp », « 1/2 »). */
function measure(m: string): Pick<RecipeIngredient, 'qty' | 'unit'> {
  const s = m.trim().toLowerCase();
  const n = s.match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?/);
  if (!n) return {};
  const qty = n[2] ? +n[1] / +n[2] : +n[1].replace(',', '.');
  const rest = s.slice(n[0].length).trim();
  const u = rest.match(/^(kg|g|ml|cl|l)\b/);
  if (u) return { qty, unit: u[1] };
  if (/^lbs?\b|^pounds?\b/.test(rest)) return { qty: Math.round(qty * 454), unit: 'g' };
  if (/^oz\b/.test(rest)) return { qty: Math.round(qty * 28), unit: 'g' };
  if (/^cups?\b/.test(rest)) return { qty: Math.round(qty * 240), unit: 'ml' };
  if (/^tbsp|^tablespoons?/.test(rest)) return { qty, unit: 'c. à soupe' };
  if (/^tsp|^teaspoons?/.test(rest)) return { qty, unit: 'c. à café' };
  if (!rest || /^(large|medium|small|whole)/.test(rest)) return { qty, unit: 'pièce' };
  return {};
}

interface Meal {
  idMeal: string;
  strMeal: string;
  strMealThumb?: string;
  strInstructions?: string;
  strCategory?: string;
  strArea?: string;
  strSource?: string;
  [k: string]: string | undefined;
}

export interface WebHit {
  id: string;
  name: string;
  image?: string;
}

async function get(path: string): Promise<Meal[]> {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`TheMealDB ${res.status}`);
  return (await res.json()).meals ?? [];
}

const hit = (m: Meal): WebHit => ({ id: m.idMeal, name: m.strMeal, image: m.strMealThumb });

/** Cherche par nom de plat, ou par ingrédient (« poulet » → chicken). */
export async function searchWeb(query: string): Promise<WebHit[]> {
  const en = toEnglish(query);
  const [byName, byIngredient] = await Promise.all([
    get(`search.php?s=${encodeURIComponent(query)}`).catch(() => []),
    en ? get(`filter.php?i=${encodeURIComponent(en.replace(/ /g, '_'))}`).catch(() => []) : []
  ]);
  const seen = new Set<string>();
  return [...byName, ...byIngredient].filter((m) => !seen.has(m.idMeal) && seen.add(m.idMeal)).map(hit);
}

/** Idées à partir du stock : recettes contenant le plus d'ingrédients disponibles. */
export async function ideasFromStock(names: string[], limit = 4): Promise<WebHit[]> {
  const en = [...new Set(names.map(toEnglish).filter((e): e is string => !!e))].slice(0, limit);
  const lists = await Promise.all(en.map((i) => get(`filter.php?i=${encodeURIComponent(i.replace(/ /g, '_'))}`).catch(() => [])));
  const score = new Map<string, { m: Meal; n: number }>();
  for (const l of lists) for (const m of l) score.set(m.idMeal, { m, n: (score.get(m.idMeal)?.n ?? 0) + 1 });
  return [...score.values()].sort((a, b) => b.n - a.n).slice(0, 30).map((s) => hit(s.m));
}

/** Recette complète, convertie au format de l'app (non enregistrée). */
export async function fetchWebRecipe(id: string): Promise<Recipe | null> {
  const [m] = await get(`lookup.php?i=${encodeURIComponent(id)}`);
  if (!m) return null;
  const ingredients: RecipeIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = m[`strIngredient${i}`]?.trim();
    if (!name) continue;
    const q = measure(m[`strMeasure${i}`] ?? '');
    ingredients.push(q.qty != null ? { name: toFrench(name), ...q } : parseIngredient(toFrench(name)));
  }
  const steps = (m.strInstructions ?? '')
    .split(/\r?\n+/)
    .map((s) => s.replace(/^(step\s*)?\d+[.):]?\s*/i, '').trim())
    .filter((s) => s.length > 2);
  return {
    id: `web-${m.idMeal}`,
    name: m.strMeal,
    emoji: '🌐',
    servings: 4,
    tags: [m.strCategory, m.strArea].filter((t): t is string => !!t).map((t) => t.toLowerCase()),
    ingredients,
    steps,
    source: 'web',
    url: m.strSource || `https://www.themealdb.com/meal/${m.idMeal}`,
    image: m.strMealThumb,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

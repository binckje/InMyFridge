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
  parsley: 'persil', basil: 'basilic', coriander: 'coriandre', 'chilli powder': 'piment', chilli: 'piment', ginger: 'gingembre', oregano: 'origan', rosemary: 'romarin',
  // Ingrédients fréquents sur TheMealDB
  'spring onion': 'cébette', scallion: 'cébette', 'green onion': 'cébette', 'cherry tomato': 'tomates cerises', 'plum tomato': 'tomates',
  'fish sauce': 'sauce poisson', 'oyster sauce': 'sauce huître', 'worcestershire sauce': 'sauce worcestershire', 'hot sauce': 'sauce piquante',
  'tomato ketchup': 'ketchup', ketchup: 'ketchup', mayonnaise: 'mayonnaise', 'sesame oil': 'huile de sésame', 'sesame seed': 'graines de sésame',
  'rice vinegar': 'vinaigre de riz', 'white wine vinegar': 'vinaigre', 'red wine vinegar': 'vinaigre', 'balsamic vinegar': 'vinaigre balsamique', 'cider vinegar': 'vinaigre de cidre',
  'coconut cream': 'crème de coco', 'condensed milk': 'lait concentré', 'cream cheese': 'fromage frais', 'whipping cream': 'crème liquide', cream: 'crème liquide',
  'plain yogurt': 'yaourt', 'natural yogurt': 'yaourt', ricotta: 'ricotta', mascarpone: 'mascarpone', 'goat cheese': 'chèvre', 'gruyere': 'gruyère', 'cheddar': 'cheddar',
  'garam masala': 'garam masala', turmeric: 'curcuma', 'ground cumin': 'cumin', 'cumin seed': 'cumin', 'ground coriander': 'coriandre', 'coriander seed': 'coriandre',
  cardamom: 'cardamome', clove: 'clou de girofle', 'star anise': 'anis étoilé', 'cayenne pepper': 'piment de cayenne', 'chilli flake': 'piment', 'red chilli': 'piment', 'green chilli': 'piment',
  'smoked paprika': 'paprika', 'mixed spice': 'quatre-épices', allspice: 'quatre-épices', 'dried oregano': 'origan', sage: 'sauge', dill: 'aneth', mint: 'menthe', chive: 'ciboulette', tarragon: 'estragon',
  'fresh thyme': 'thym', 'garlic powder': 'ail', 'onion powder': 'oignon', 'sea salt': 'sel', 'black pepper corn': 'poivre', 'white pepper': 'poivre',
  'self raising flour': 'farine', cornflour: 'fécule de maïs', cornstarch: 'fécule de maïs', 'corn flour': 'fécule de maïs', 'bicarbonate of soda': 'bicarbonate', 'baking soda': 'bicarbonate',
  'muscovado sugar': 'cassonade', 'light brown soft sugar': 'cassonade', 'dark brown soft sugar': 'cassonade', 'golden syrup': 'sirop', 'maple syrup': "sirop d'érable",
  'milk chocolate': 'chocolat au lait', 'white chocolate': 'chocolat blanc', 'dark chocolate chip': 'chocolat noir', almond: 'amandes', 'ground almond': 'amandes en poudre',
  walnut: 'noix', hazelnut: 'noisettes', peanut: 'cacahuètes', 'peanut butter': 'beurre de cacahuète', 'pine nut': 'pignons de pin', raisin: 'raisins secs', sultana: 'raisins secs',
  oat: "flocons d'avoine", 'rolled oat': "flocons d'avoine", couscous: 'semoule', 'egg noodle': 'nouilles', 'rice noodle': 'nouilles de riz', 'jasmine rice': 'riz',
  tortilla: 'tortillas', 'flour tortilla': 'tortillas', pitta: 'pain pita', 'pita bread': 'pain pita', 'white bread': 'pain', 'filo pastry': 'pâte filo',
  'black bean': 'haricots noirs', 'cannellini bean': 'haricots blancs', 'butter bean': 'haricots blancs', 'baked bean': 'haricots blancs', sweetcorn: 'maïs', corn: 'maïs',
  'red pepper flake': 'piment', 'red bell pepper': 'poivrons', 'green bell pepper': 'poivrons', squash: 'courge', 'butternut squash': 'butternut', pumpkin: 'potiron',
  cauliflower: 'chou-fleur', kale: 'chou kale', asparagus: 'asperges', beetroot: 'betterave', radish: 'radis', fennel: 'fenouil', parsnip: 'panais', turnip: 'navet',
  'baby spinach': 'épinards', rocket: 'roquette', watercress: 'cresson', olive: 'olives', 'black olive': 'olives', 'green olive': 'olives', caper: 'câpres',
  'lemon zest': 'citron', 'lime juice': 'jus de citron vert', 'orange juice': "jus d'orange", pear: 'poires', mango: 'mangue', pineapple: 'ananas', blueberry: 'myrtilles',
  'beef stock cube': 'bouillon', 'chicken stock cube': 'bouillon', 'vegetable stock cube': 'bouillon', 'stock cube': 'bouillon',
  'chicken thigh': 'poulet', 'chicken leg': 'poulet', 'chicken wing': 'poulet', 'whole chicken': 'poulet', turkey: 'dinde', duck: 'canard',
  'pork belly': 'poitrine de porc', 'pork loin': 'porc', 'pork mince': 'porc haché', 'minced pork': 'porc haché', 'lamb mince': 'agneau', 'lamb shoulder': 'agneau', 'lamb leg': 'agneau',
  'beef fillet': 'boeuf', 'stewing beef': 'boeuf', 'beef mince': 'boeuf haché', steak: 'boeuf', 'sirloin steak': 'boeuf', 'streaky bacon': 'lardons', pancetta: 'lardons', prosciutto: 'jambon cru',
  'smoked salmon': 'saumon fumé', 'king prawn': 'crevettes', 'tiger prawn': 'crevettes', mussel: 'moules', squid: 'calamars', haddock: 'églefin', mackerel: 'maquereau', sardine: 'sardines', anchovy: 'anchois',
  tofu: 'tofu', 'dry white wine': 'vin blanc', beer: 'bière', brandy: 'cognac', rum: 'rhum', 'ice cream': 'glace',
  'free-range egg': 'oeufs', 'egg yolk': 'oeufs', 'cold water': 'eau', 'boiling water': 'eau', 'warm water': 'eau', 'salted butter': 'beurre', 'semi-skimmed milk': 'lait', 'whole milk': 'lait'
};

/** Français → anglais : premier terme anglais simple rencontré (« pâtes » → pasta). */
const FR_EN: Record<string, string> = {};
for (const [en, fr] of Object.entries(EN_FR)) {
  const k = tokens(fr).join(' ');
  if (!(k in FR_EN) && (!en.includes(' ') || en === 'minced beef')) FR_EN[k] = en;
}

/** Clé du dictionnaire : telle quelle, sinon au singulier (« tomatoes » → tomato, « berries » → berry) ou au pluriel. */
function lookup(en: string): string | undefined {
  const k = en.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const c of [k, k.replace(/ies$/, 'y'), k.replace(/(ch|sh|ss|x|o)es$/, '$1'), k.replace(/s$/, ''), `${k}s`])
    if (Object.hasOwn(EN_FR, c)) return EN_FR[c];
}

/** Traduction d'un ingrédient anglais (inconnu → laissé tel quel). */
export const toFrench = (en: string) => lookup(en) ?? en.trim().toLowerCase();

/** Ingrédient anglais dont la traduction est connue (comparaison au stock possible). */
export const isKnown = (en: string) => lookup(en) !== undefined;

/** Ingrédient français → anglais, pour chercher par ingrédient. */
export function toEnglish(fr: string): string | undefined {
  const t = tokens(fr);
  for (let n = t.length; n > 0; n--) {
    const hit = FR_EN[t.slice(0, n).join(' ')];
    if (hit) return hit;
  }
}

/** Unités anglaises sans équivalent métrique → libellé français. */
const EN_UNITS: [RegExp, string][] = [
  [/^cloves?\b/, 'gousse'],
  [/^(tins?|cans?)\b/, 'boîte'],
  [/^slices?\b/, 'tranche'],
  [/^pinch(es)?\b/, 'pincée'],
  [/^sprigs?\b/, 'brin'],
  [/^handfuls?\b/, 'poignée'],
  [/^(packets?|sachets?)\b/, 'sachet'],
  [/^leaves\b|^leaf\b/, 'feuille'],
  [/^dash(es)?\b/, 'trait'],
  [/^bunch(es)?\b/, 'botte'],
  [/^sticks?\b/, 'bâton']
];

/** Mesures anglaises → quantité (« 200g », « 1 1/2 cups », « 2 tbsp », « 1 (400g) tin », « ½ »). */
export function measure(m: string): Pick<RecipeIngredient, 'qty' | 'unit'> {
  let s = m
    .trim()
    .toLowerCase()
    .replace(/½/g, ' 1/2')
    .replace(/¼/g, ' 1/4')
    .replace(/¾/g, ' 3/4')
    .trim();
  // « 1 (400g) tin » : la contenance entre parenthèses est la vraie quantité
  const paren = s.match(/^(\d+)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\s*\)/);
  if (paren) return { qty: +paren[1] * +paren[2].replace(',', '.'), unit: paren[3] };
  const n = s.match(/^(?:(\d+)\s+)?(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?/);
  if (!n) return {};
  const frac = n[3] ? +n[2] / +n[3] : +n[2].replace(',', '.');
  const qty = Math.round(((n[1] ? +n[1] : 0) + frac) * 100) / 100;
  s = s.slice(n[0].length).trim();
  const u = s.match(/^(kg|g|ml|cl|l)\b/);
  if (u) return { qty, unit: u[1] };
  if (/^lbs?\b|^pounds?\b/.test(s)) return { qty: Math.round(qty * 454), unit: 'g' };
  if (/^oz\b|^ounces?\b/.test(s)) return { qty: Math.round(qty * 28), unit: 'g' };
  if (/^cups?\b/.test(s)) return { qty: Math.round(qty * 240), unit: 'ml' };
  if (/^tbsp|^tablespoons?|^tbs\b/.test(s)) return { qty, unit: 'c. à soupe' };
  if (/^tsp|^teaspoons?/.test(s)) return { qty, unit: 'c. à café' };
  const label = EN_UNITS.find(([re]) => re.test(s))?.[1];
  if (label) return { qty, unit: label };
  // « 2 », « 2 large », « 3 chopped » : nombre de pièces
  return { qty, unit: 'pièce' };
}

export interface Meal {
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

/** Noms anglais des ingrédients d'une recette TheMealDB. */
const rawIngredients = (m: Meal) =>
  Array.from({ length: 20 }, (_, i) => m[`strIngredient${i + 1}`]?.trim()).filter((n): n is string => !!n);

/**
 * Liste d'ingrédients fiable : au moins 3 ingrédients, tous traduits.
 * Sinon on ne peut pas dire avec certitude ce qui manque.
 */
export const isReliable = (m: Meal) => {
  const names = rawIngredients(m);
  return names.length >= 3 && names.every(isKnown);
};

/** Recette complète, convertie au format de l'app (non enregistrée). */
export async function fetchWebRecipe(id: string): Promise<Recipe | null> {
  const [m] = await get(`lookup.php?i=${encodeURIComponent(id)}`);
  return m ? convert(m) : null;
}

/**
 * Détail des premiers résultats, en ne gardant que les recettes dont la liste
 * d'ingrédients est fiable (voir isReliable). Les échecs réseau sont ignorés.
 */
export async function fetchReliable(hits: WebHit[], limit = 15): Promise<Recipe[]> {
  const meals = await Promise.all(
    hits.slice(0, limit).map((h) => get(`lookup.php?i=${encodeURIComponent(h.id)}`).then(([m]) => m, () => undefined))
  );
  return meals.filter((m): m is Meal => !!m && isReliable(m)).map(convert);
}

function convert(m: Meal): Recipe {
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
    video: m.strYoutube || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

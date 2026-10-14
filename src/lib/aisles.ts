import type { Aisle } from './types';

/** Rayons par défaut (reprend l'organisation du stock). Configurable plus tard. */
export const AISLES: Aisle[] = [
  { id: 'fruits-legumes', label: 'Fruits et légumes', emoji: '🥕', order: 1 },
  { id: 'viandes-poissons', label: 'Viandes / poissons', emoji: '🥩', order: 2 },
  { id: 'cremerie', label: 'Crémerie', emoji: '🧀', order: 3 },
  { id: 'laiterie-dessert', label: 'Laiterie / desserts', emoji: '🍮', order: 4 },
  { id: 'liquides', label: 'Boissons', emoji: '🧃', order: 5 },
  { id: 'surgeles', label: 'Surgelés', emoji: '🧊', order: 6 },
  { id: 'epicerie-salee', label: 'Épicerie salée', emoji: '🥫', order: 7 },
  { id: 'epicerie-sucree', label: 'Épicerie sucrée', emoji: '🍫', order: 8 },
  { id: 'menager', label: 'Produits ménagers', emoji: '🧽', order: 9 },
  { id: 'autre', label: 'Autre', emoji: '🛒', order: 10 }
];

export const aisleById = (id: string): Aisle =>
  AISLES.find((a) => a.id === id) ?? AISLES[AISLES.length - 1];

/** Mots-clés pour deviner le rayon d'un article saisi à la main. */
const KEYWORDS: Record<string, string[]> = {
  'fruits-legumes': ['pomme', 'poire', 'banane', 'orange', 'citron', 'tomate', 'carotte', 'salade', 'oignon', 'ail', 'courgette', 'poireau', 'pomme de terre', 'patate', 'fraise', 'raisin', 'avocat', 'concombre', 'poivron', 'champignon', 'épinard', 'kiwi', 'herbes', 'persil', 'basilic'],
  'viandes-poissons': ['poulet', 'boeuf', 'bœuf', 'porc', 'jambon', 'steak', 'saucisse', 'lardon', 'dinde', 'veau', 'agneau', 'poisson', 'saumon', 'thon frais', 'cabillaud', 'crevette', 'viande', 'haché'],
  cremerie: ['lait', 'beurre', 'fromage', 'crème', 'creme', 'oeuf', 'œuf', 'emmental', 'parmesan', 'mozzarella', 'comté', 'chèvre'],
  'laiterie-dessert': ['yaourt', 'yogourt', 'compote', 'dessert', 'flan', 'fromage blanc', 'skyr'],
  liquides: ['eau', 'jus', 'soda', 'bière', 'biere', 'vin', 'sirop', 'coca', 'limonade'],
  surgeles: ['surgelé', 'surgele', 'glace', 'frites', 'pizza surgelée'],
  'epicerie-salee': ['pâtes', 'pates', 'riz', 'farine', 'huile', 'vinaigre', 'sel', 'poivre', 'conserve', 'sauce', 'moutarde', 'ketchup', 'mayonnaise', 'lentille', 'pois chiche', 'semoule', 'bouillon', 'épice', 'thon', 'chips', 'pain'],
  'epicerie-sucree': ['sucre', 'chocolat', 'café', 'cafe', 'thé', 'the', 'biscuit', 'gâteau', 'confiture', 'miel', 'céréales', 'cereales', 'nutella', 'bonbon'],
  menager: ['papier', 'sopalin', 'lessive', 'liquide vaisselle', 'éponge', 'eponge', 'savon', 'shampoing', 'dentifrice', 'sac poubelle', 'javel', 'nettoyant', 'pastille', 'mouchoir']
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function guessAisle(name: string): string {
  const n = norm(name);
  let best = { id: 'autre', len: 0 };
  for (const [id, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      const k = norm(w);
      // le mot-clé le plus long gagne (« fromage blanc » > « fromage »)
      if (k.length > best.len && new RegExp(`(^|\\s)${k}`).test(n)) best = { id, len: k.length };
    }
  }
  return best.id;
}

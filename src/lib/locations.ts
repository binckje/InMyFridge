import type { Category, Location } from './types';

/** Sous-catégories communes au réfrigérateur et au congélateur. */
const COLD: Category[] = [
  { id: 'viandes', label: 'Viandes / poissons', emoji: '🥩' },
  { id: 'cremerie', label: 'Crémerie', emoji: '🧀' },
  { id: 'fruits-legumes', label: 'Fruits et légumes', emoji: '🥕' },
  { id: 'liquides', label: 'Liquides', emoji: '🧃' },
  { id: 'restes', label: 'Restes', emoji: '🍲' },
  { id: 'laiterie-epicerie', label: 'Laiterie / dessert / épicerie', emoji: '🍮' },
  { id: 'autre', label: 'Autre', emoji: '📦' }
];

/** Emplacements fixes (v1). Configurables plus tard. */
export const LOCATIONS: Location[] = [
  { id: 'frigo', label: 'Réfrigérateur', emoji: '🧊', categories: COLD },
  { id: 'congelateur', label: 'Congélateur', emoji: '❄️', categories: COLD },
  { id: 'epicerie-salee', label: 'Épicerie salée', emoji: '🥫' },
  { id: 'epicerie-sucree', label: 'Épicerie sucrée', emoji: '🍫' },
  { id: 'autres', label: 'Autres', emoji: '📦' },
  { id: 'menager', label: 'Produits ménagers', emoji: '🧽' }
];

export const locationById = (id: string): Location =>
  LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];

export const categoryOf = (loc: Location, id?: string): Category | undefined =>
  loc.categories ? (loc.categories.find((c) => c.id === id) ?? loc.categories.at(-1)) : undefined;

/** Emplacement probable d'après le rayon deviné. */
export function guessLocation(aisleId: string): string {
  switch (aisleId) {
    case 'surgeles': return 'congelateur';
    case 'epicerie-salee': return 'epicerie-salee';
    case 'epicerie-sucree': return 'epicerie-sucree';
    case 'menager': return 'menager';
    case 'autre': return 'autres';
    default: return 'frigo';
  }
}

/** Sous-catégorie probable (frigo / congélateur) d'après le rayon deviné. */
export function guessCategory(aisleId: string): string {
  switch (aisleId) {
    case 'viandes-poissons': return 'viandes';
    case 'cremerie': return 'cremerie';
    case 'fruits-legumes': return 'fruits-legumes';
    case 'liquides': return 'liquides';
    case 'laiterie-dessert':
    case 'epicerie-salee':
    case 'epicerie-sucree': return 'laiterie-epicerie';
    default: return 'autre';
  }
}

/** Champs communs : tous les enregistrements sont synchronisables plus tard (Drive). */
export interface SyncFields {
  id: string;
  updatedAt: number;
  /** Suppression logique, nécessaire pour propager les suppressions lors de la synchro. */
  deleted?: boolean;
}

export type Level = 'plus beaucoup' | 'moyen' | 'suffisamment';
export const LEVELS: Level[] = ['plus beaucoup', 'moyen', 'suffisamment'];

export type Unit = 'g' | 'kg' | 'ml' | 'cl' | 'l' | 'pièce';

export interface StockItem extends SyncFields {
  name: string;
  /** Emplacement (frigo, congélateur…), voir locations.ts. */
  locationId: string;
  /** Sous-catégorie (frigo / congélateur uniquement). */
  categoryId?: string;
  /** Rayon utilisé quand le produit part dans la liste de courses. */
  aisleId: string;
  /** Quantité numérique (avec unit) OU niveau qualitatif (level). */
  qty?: number;
  unit?: Unit;
  level?: Level;
  thresholdQty?: number;
  thresholdLevel?: Level;
}

export interface ShoppingItem extends SyncFields {
  name: string;
  /** Texte libre : « 2 », « 500 g », « 1 pack »… */
  qty?: string;
  aisleId: string;
  checked: boolean;
  createdAt: number;
  /** Ajouté automatiquement car ce produit du stock est sous son seuil. */
  stockItemId?: string;
}

export interface Category {
  id: string;
  label: string;
  emoji: string;
}

export interface Location {
  id: string;
  label: string;
  emoji: string;
  categories?: Category[];
}

/** Emplacement enregistré (configurable et synchronisé). */
export interface StoredLocation extends Location, SyncFields {
  order: number;
}

export interface Aisle {
  id: string;
  label: string;
  emoji: string;
  order: number;
}

export interface RecipeIngredient {
  name: string;
  qty?: number;
  /** Unité convertible (g, kg, ml, cl, l, pièce) ou libellé libre (« c. à soupe », « pincée »…). */
  unit?: Unit | string;
  optional?: boolean;
}

export interface Recipe extends SyncFields {
  name: string;
  emoji?: string;
  servings: number;
  /** Ce que compte servings quand ce ne sont pas des personnes (« cookies », « crêpes »…). */
  yieldUnit?: string;
  /** Temps total en minutes. */
  time?: number;
  tags?: string[];
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Note de 1 à 5. */
  rating?: number;
  /** base = fournie avec l'app, perso = saisie, web = importée d'internet. */
  source: 'base' | 'perso' | 'web';
  url?: string;
  image?: string;
  createdAt: number;
}

/** Produit identifié par code-barres (Open Food Facts, corrigé par l'utilisateur). */
export interface Product {
  code: string;
  name: string;
  brand?: string;
  /** Contenance d'un exemplaire (« 500 g »). */
  qty?: number;
  unit?: Unit;
  aisleId: string;
  locationId?: string;
  image?: string;
  updatedAt: number;
}

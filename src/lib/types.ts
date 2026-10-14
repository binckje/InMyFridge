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

export interface Aisle {
  id: string;
  label: string;
  emoji: string;
  order: number;
}

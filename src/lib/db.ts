import Dexie, { type EntityTable } from 'dexie';
import type { Recipe, ShoppingItem, StockItem } from './types';

/** Mémoire des articles déjà achetés : rayon retenu + fréquence (pour les suggestions). */
export interface Memory {
  key: string; // nom normalisé
  name: string;
  aisleId: string;
  count: number;
  lastUsed: number;
}

export const db = new Dexie('inmyfridge') as Dexie & {
  stock: EntityTable<StockItem, 'id'>;
  shopping: EntityTable<ShoppingItem, 'id'>;
  memory: EntityTable<Memory, 'key'>;
  recipes: EntityTable<Recipe, 'id'>;
};

db.version(1).stores({
  stock: 'id, aisleId, updatedAt',
  shopping: 'id, aisleId, checked, stockItemId, updatedAt',
  memory: 'key, count, lastUsed'
});

db.version(2)
  .stores({ stock: 'id, locationId, aisleId, updatedAt' })
  .upgrade((tx) =>
    tx
      .table('stock')
      .toCollection()
      .modify((s: StockItem) => {
        s.locationId ??= 'frigo';
      })
  );

db.version(3).stores({ recipes: 'id, updatedAt' });

export const newId = () => crypto.randomUUID();

/** Demande au navigateur de ne pas purger les données (important sur iOS). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* non supporté : tant pis */
  }
}

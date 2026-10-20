import Dexie, { type EntityTable } from 'dexie';
import type { Snapshot } from './sync';
import type { Product, Recipe, ShoppingItem, StockGroup, StockItem, StoredLocation } from './types';

/** Mémoire des articles déjà achetés : rayon retenu + fréquence (pour les suggestions). */
export interface Memory {
  key: string; // nom normalisé
  name: string;
  aisleId: string;
  count: number;
  lastUsed: number;
}

/** Vidéo d'une recette copiée sur l'appareil (clé = id de la recette). Non synchronisée. */
export interface RecipeVideo {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

/** Copie automatique complète des données, sur l'appareil seulement (clé = date). Non synchronisée. */
export interface LocalSnapshot {
  id: number;
  data: Snapshot;
}

export const db = new Dexie('inmyfridge') as Dexie & {
  stock: EntityTable<StockItem, 'id'>;
  shopping: EntityTable<ShoppingItem, 'id'>;
  memory: EntityTable<Memory, 'key'>;
  recipes: EntityTable<Recipe, 'id'>;
  products: EntityTable<Product, 'code'>;
  locations: EntityTable<StoredLocation, 'id'>;
  videos: EntityTable<RecipeVideo, 'id'>;
  snapshots: EntityTable<LocalSnapshot, 'id'>;
  groups: EntityTable<StockGroup, 'id'>;
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
db.version(4).stores({ products: 'code, updatedAt' });
db.version(5).stores({ locations: 'id, order, updatedAt' });
db.version(6).stores({ videos: 'id' });
db.version(7).stores({ snapshots: 'id' });
db.version(8).stores({ groups: 'id, updatedAt' });

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

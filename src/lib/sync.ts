import { db, type Memory } from './db';
import type { Product, Recipe, ShoppingItem, StockItem, StoredLocation } from './types';

/** Contenu du fichier de synchro partagé entre tous les appareils du foyer. */
export interface Snapshot {
  version: 1;
  savedAt: number;
  stock: StockItem[];
  shopping: ShoppingItem[];
  memory: Memory[];
  /** Absent des fichiers créés avant l'écran Recettes. */
  recipes?: Recipe[];
  products?: Product[];
  locations?: StoredLocation[];
}

/** Fournisseur de stockage distant (Google Drive aujourd'hui, Nextcloud / NAS plus tard). */
export interface SyncProvider {
  read(): Promise<Snapshot | null>;
  write(snapshot: Snapshot): Promise<void>;
}

/** Garde, pour chaque clé, la version la plus récente (dernière modification gagne). */
function mergeBy<T>(local: T[], remote: T[], key: (t: T) => string, time: (t: T) => number) {
  const out = new Map<string, T>();
  for (const t of local) out.set(key(t), t);
  const changed: T[] = [];
  for (const r of remote) {
    const l = out.get(key(r));
    if (!l || time(r) > time(l)) {
      out.set(key(r), r);
      changed.push(r);
    }
  }
  return { all: [...out.values()], changed };
}

export interface SyncResult {
  received: number;
}

/**
 * Lit le fichier distant, fusionne avec la base locale, puis réécrit le fichier fusionné.
 * Chaque appareil garde toutes ses données : si deux synchros se croisent,
 * la suivante réintègre ce qui aurait été écrasé.
 */
export async function syncWith(provider: SyncProvider): Promise<SyncResult> {
  const remote = await provider.read();
  const [stock, shopping, memory, recipes, products, locations] = await Promise.all([
    db.stock.toArray(),
    db.shopping.toArray(),
    db.memory.toArray(),
    db.recipes.toArray(),
    db.products.toArray(),
    db.locations.toArray()
  ]);

  const s = mergeBy(stock, remote?.stock ?? [], (i) => i.id, (i) => i.updatedAt);
  const sh = mergeBy(shopping, remote?.shopping ?? [], (i) => i.id, (i) => i.updatedAt);
  const m = mergeBy(memory, remote?.memory ?? [], (i) => i.key, (i) => i.lastUsed);
  const r = mergeBy(recipes, remote?.recipes ?? [], (i) => i.id, (i) => i.updatedAt);
  const p = mergeBy(products, remote?.products ?? [], (i) => i.code, (i) => i.updatedAt);
  const l = mergeBy(locations, remote?.locations ?? [], (i) => i.id, (i) => i.updatedAt);

  await db.transaction('rw', [db.stock, db.shopping, db.memory, db.recipes, db.products, db.locations], async () => {
    await db.stock.bulkPut(s.changed);
    await db.shopping.bulkPut(sh.changed);
    await db.memory.bulkPut(m.changed);
    await db.recipes.bulkPut(r.changed);
    await db.products.bulkPut(p.changed);
    await db.locations.bulkPut(l.changed);
  });

  await provider.write({
    version: 1,
    savedAt: Date.now(),
    stock: s.all,
    shopping: sh.all,
    memory: m.all,
    recipes: r.all,
    products: p.all,
    locations: l.all
  });

  return { received: s.changed.length + sh.changed.length + m.changed.length + r.changed.length + p.changed.length + l.changed.length };
}

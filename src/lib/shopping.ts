import { db, newId, type Memory } from './db';
import { guessAisle } from './aisles';
import { LEVELS, type ShoppingItem, type StockItem } from './types';

const keyOf = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Rayon : d'abord celui déjà utilisé pour ce nom, sinon deviné par mots-clés. */
export async function aisleFor(name: string): Promise<string> {
  const mem = await db.memory.get(keyOf(name));
  return mem?.aisleId ?? guessAisle(name);
}

async function remember(name: string, aisleId: string) {
  const key = keyOf(name);
  const prev = await db.memory.get(key);
  await db.memory.put({
    key,
    name: name.trim(),
    aisleId,
    count: (prev?.count ?? 0) + 1,
    lastUsed: Date.now()
  });
}

  /** « 2 l lait », « lait 2l », « 3 pommes », « lait x2 » → { qty, name } */
export function parseShopping(input: string): { name: string; qty: string } {
  const unit = '(?:g|kg|ml|cl|l|x|pcs?|pièces?|paquets?|boîtes?|bouteilles?)';
  const before = input.match(new RegExp(`^(\\d+(?:[.,]\\d+)?\\s*${unit}?)\\s+(.+)$`, 'i'));
  if (before) return { qty: before[1], name: before[2] };
  const after = input.match(new RegExp(`^(.+?)\\s+((?:x\\s*)?\\d+(?:[.,]\\d+)?\\s*${unit}?)$`, 'i'));
  if (after) return { name: after[1], qty: after[2] };
  return { name: input, qty: '' };
}

export async function addItem(name: string, qty = '', aisleId?: string) {
  const clean = name.trim();
  if (!clean) return;
  // Pas de doublon : si l'article est déjà dans la liste (non coché), on met juste à jour la quantité.
  const existing = (await db.shopping.toArray()).find(
    (i) => !i.deleted && !i.checked && keyOf(i.name) === keyOf(clean)
  );
  if (existing) {
    if (qty) await updateItem(existing.id, { qty });
    return;
  }
  const now = Date.now();
  const item: ShoppingItem = {
    id: newId(),
    name: clean,
    qty: qty.trim() || undefined,
    aisleId: aisleId ?? (await aisleFor(clean)),
    checked: false,
    createdAt: now,
    updatedAt: now
  };
  await db.shopping.add(item);
  await remember(item.name, item.aisleId);
}

export async function updateItem(id: string, changes: Partial<Omit<ShoppingItem, 'id'>>) {
  await db.shopping.update(id, { ...changes, updatedAt: Date.now() });
  if (changes.aisleId || changes.name) {
    const item = await db.shopping.get(id);
    if (item) await remember(item.name, item.aisleId);
  }
}

export const toggleItem = (item: ShoppingItem) => updateItem(item.id, { checked: !item.checked });

export const deleteItem = (id: string) => updateItem(id, { deleted: true });

export async function clearChecked() {
  const now = Date.now();
  await db.shopping
    .filter((i) => i.checked && !i.deleted)
    .modify({ deleted: true, updatedAt: now });
}

/** Suggestions : articles souvent achetés, absents de la liste actuelle. */
export async function suggestions(prefix: string, limit = 6): Promise<Memory[]> {
  const inList = new Set(
    (await db.shopping.toArray()).filter((i) => !i.deleted && !i.checked).map((i) => keyOf(i.name))
  );
  const p = keyOf(prefix);
  const all = await db.memory.orderBy('count').reverse().toArray();
  return all.filter((m) => !inList.has(m.key) && (!p || m.key.includes(p))).slice(0, limit);
}

/* ---------- Lien stock → courses ---------- */

export function isLow(s: StockItem): boolean {
  if (s.deleted) return false;
  if (s.thresholdPacks != null && s.packs) return s.packs.length <= s.thresholdPacks;
  if (s.thresholdQty != null && s.qty != null) return s.qty <= s.thresholdQty;
  if (s.thresholdLevel && s.level && LEVELS.indexOf(s.level) <= LEVELS.indexOf(s.thresholdLevel)) return true;
  if (s.thresholdCount != null && s.level && s.count != null) return s.count <= s.thresholdCount;
  return false;
}

/**
 * Ajoute à la liste les produits du stock passés sous leur seuil (une seule fois par produit),
 * et retire les ajouts automatiques non cochés dont le stock est remonté.
 * Retourne le nombre d'articles ajoutés.
 */
export async function syncLowStock(): Promise<number> {
  const stock = await db.stock.toArray();
  const list = (await db.shopping.toArray()).filter((i) => !i.deleted && !i.checked);
  const linked = new Map(list.filter((i) => i.stockItemId).map((i) => [i.stockItemId!, i]));
  let added = 0;
  for (const s of stock) {
    const low = isLow(s);
    const entry = linked.get(s.id);
    if (low && !entry && !list.some((i) => keyOf(i.name) === keyOf(s.name))) {
      const now = Date.now();
      await db.shopping.add({
        id: newId(),
        name: s.name,
        aisleId: s.aisleId,
        checked: false,
        createdAt: now,
        updatedAt: now,
        stockItemId: s.id
      });
      added++;
    } else if (!low && entry) {
      await deleteItem(entry.id);
    }
  }
  return added;
}

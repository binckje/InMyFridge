import { db, newId } from './db';
import { aisleFor, syncLowStock } from './shopping';
import { guessCategory, guessLocation, locationById } from './locations';
import { LEVELS, type Level, type StockItem, type Unit } from './types';

export const UNITS: Unit[] = ['pièce', 'g', 'kg', 'ml', 'cl', 'l'];

/** Pas des boutons − / + selon l'unité. */
const STEP: Record<Unit, number> = { pièce: 1, g: 100, kg: 0.25, ml: 100, cl: 10, l: 0.25 };

const keyOf = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** « lait 2 l », « 500g pâtes », « oeufs x6 », « 3 pommes » → nom + quantité. Sans quantité → niveau. */
export function parseStock(input: string): { name: string; qty?: number; unit?: Unit } {
  const u = '(g|kg|ml|cl|l|x|pcs?|pièces?)';
  const num = '(\\d+(?:[.,]\\d+)?)';
  const toUnit = (s?: string): Unit => {
    const k = (s ?? '').toLowerCase();
    return (['g', 'kg', 'ml', 'cl', 'l'] as string[]).includes(k) ? (k as Unit) : 'pièce';
  };
  const before = input.match(new RegExp(`^${num}\\s*${u}?\\s+(.+)$`, 'i'));
  if (before) return { name: before[3], qty: +before[1].replace(',', '.'), unit: toUnit(before[2]) };
  const after = input.match(new RegExp(`^(.+?)\\s+(?:x\\s*)?${num}\\s*${u}?$`, 'i'));
  if (after) return { name: after[1], qty: +after[2].replace(',', '.'), unit: toUnit(after[3]) };
  return { name: input };
}

/** Ajout rapide. Si le produit existe déjà au même endroit : on additionne (ou on remplace). */
export async function addStock(input: string, locationId?: string): Promise<StockItem | undefined> {
  const { name, qty, unit } = parseStock(input.trim());
  const clean = name.trim();
  if (!clean) return;
  const aisleId = await aisleFor(clean);
  const loc = locationId ?? guessLocation(aisleId);
  const existing = (await db.stock.toArray()).find(
    (s) => !s.deleted && s.locationId === loc && keyOf(s.name) === keyOf(clean)
  );
  if (existing) {
    const changes: Partial<StockItem> =
      qty == null
        ? { level: 'suffisamment', qty: undefined, unit: undefined }
        : existing.unit === unit && existing.qty != null
          ? { qty: existing.qty + qty }
          : { qty, unit, level: undefined };
    await updateStock(existing.id, changes);
    return { ...existing, ...changes };
  }
  const item: StockItem = {
    id: newId(),
    name: clean,
    locationId: loc,
    categoryId: locationById(loc).categories ? guessCategory(aisleId) : undefined,
    aisleId,
    updatedAt: Date.now(),
    ...(qty == null ? { level: 'suffisamment', thresholdLevel: 'plus beaucoup' } : { qty, unit })
  };
  await db.stock.add(item);
  await syncLowStock();
  return item;
}

export async function updateStock(id: string, changes: Partial<Omit<StockItem, 'id'>>) {
  await db.stock.update(id, { ...changes, updatedAt: Date.now() });
  await syncLowStock();
}

export const deleteStock = (id: string) => updateStock(id, { deleted: true });

/** Bouton − / + : pas adapté à l'unité, ou niveau suivant / précédent. */
export function adjust(item: StockItem, dir: 1 | -1) {
  if (item.level) {
    const i = Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(item.level) + dir));
    return updateStock(item.id, { level: LEVELS[i] as Level });
  }
  const step = STEP[item.unit ?? 'pièce'];
  const qty = Math.max(0, Math.round(((item.qty ?? 0) + dir * step) * 1000) / 1000);
  return updateStock(item.id, { qty });
}

export const formatQty = (s: StockItem): string =>
  s.level ?? (s.qty == null ? '' : `${String(s.qty).replace('.', ',')}${s.unit && s.unit !== 'pièce' ? ' ' + s.unit : ''}`);

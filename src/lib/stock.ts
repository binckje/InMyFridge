import { db, newId } from './db';
import { aisleFor, syncLowStock } from './shopping';
import { guessCategory, guessLocation, locationById } from './locations.svelte';
import { LEVELS, type Level, type ShoppingItem, type StockItem, type Unit } from './types';

export const UNITS: Unit[] = ['pièce', 'g', 'kg', 'ml', 'cl', 'l'];

/** Type de quantité choisi à la saisie : une unité, ou un niveau qualitatif. */
export type QtyKind = Unit | 'level';

/** Type déduit du texte tapé (« lait 2 l » → l, « oeufs 6 » → pièce, « beurre » → niveau). */
export const detectKind = (input: string): QtyKind => parseStock(input.trim()).unit ?? 'level';

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
export async function addStock(
  input: string,
  locationId?: string,
  kind: QtyKind = detectKind(input),
  aisle?: string
): Promise<StockItem | undefined> {
  const parsed = parseStock(input.trim());
  const name = parsed.name;
  const unit = kind === 'level' ? undefined : kind;
  const qty = unit ? (parsed.qty ?? 1) : undefined;
  const clean = name.trim();
  if (!clean) return;
  const aisleId = aisle ?? (await aisleFor(clean));
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

/* ---------- Retour de courses ---------- */

const DIM: Record<Unit, [string, number]> = {
  g: ['m', 1], kg: ['m', 1000], ml: ['v', 1], cl: ['v', 10], l: ['v', 1000], pièce: ['n', 1]
};

/** Convertit une quantité d'une unité à une autre (g ↔ kg, ml ↔ cl ↔ l). Incompatible → undefined. */
export function convert(qty: number, from: Unit, to: Unit): number | undefined {
  const [df, ff] = DIM[from];
  const [dt, ft] = DIM[to];
  return df === dt ? Math.round(((qty * ff) / ft) * 1000) / 1000 : undefined;
}

export interface RestockLine {
  shoppingId: string;
  name: string;
  /** Produit du stock à réapprovisionner (sinon : nouveau produit). */
  stock?: StockItem;
  /** Quantité achetée, dans l'unité du produit du stock (ou texte libre pour un nouveau produit). */
  qty: string;
  include: boolean;
}

/** Prépare le rangement des articles achetés : produit du stock correspondant + quantité déduite. */
export async function planRestock(items: ShoppingItem[]): Promise<RestockLine[]> {
  const stock = (await db.stock.toArray()).filter((s) => !s.deleted);
  return items.map((i) => {
    const s =
      stock.find((s) => s.id === i.stockItemId) ?? stock.find((s) => keyOf(s.name) === keyOf(i.name));
    const bought: { qty?: number; unit?: Unit } = i.qty ? parseStock(`x ${i.qty}`) : {};
    let qty = '';
    if (s && !s.level && bought.qty != null) {
      const q = convert(bought.qty, bought.unit ?? 'pièce', s.unit ?? 'pièce');
      if (q != null) qty = String(q).replace('.', ',');
    } else if (!s) qty = i.qty ?? '';
    return { shoppingId: i.id, name: i.name, stock: s, qty, include: !!s };
  });
}

/** Range les achats : niveau → « suffisamment », quantité → ajoutée, nouveau produit → créé. */
export async function applyRestock(lines: RestockLine[]): Promise<number> {
  let n = 0;
  for (const l of lines) {
    if (!l.include) continue;
    const s = l.stock;
    if (!s) {
      await addStock(`${l.name} ${l.qty}`.trim());
    } else if (s.level) {
      await updateStock(s.id, { level: 'suffisamment' });
    } else {
      const q = parseFloat(l.qty.replace(',', '.'));
      if (!Number.isFinite(q) || q <= 0) continue;
      // relu en base : le stock a pu changer depuis l'ouverture de la feuille (cuisine, synchro)
      const cur = await db.stock.get(s.id);
      await updateStock(s.id, { qty: Math.round(((cur?.qty ?? 0) + q) * 1000) / 1000 });
    }
    n++;
  }
  return n;
}

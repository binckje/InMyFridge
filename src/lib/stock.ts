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

/**
 * « lait 2 l », « 500g pâtes », « oeufs x6 », « 3 pommes » → nom + quantité. Sans quantité → niveau.
 * « 2x250g beurre », « beurre 2 x 250 g » → 2 lots de 250 g (packs).
 */
export function parseStock(input: string): { name: string; qty?: number; unit?: Unit; packs?: number[] } {
  const u = '(g|kg|ml|cl|l|x|pcs?|pièces?)';
  const num = '(\\d+(?:[.,]\\d+)?)';
  const lot = `(\\d+)\\s*[x×]\\s*${num}\\s*(g|kg|ml|cl|l)`;
  const lots = (n: string, size: string, unit: string) => {
    const packs = Array<number>(+n).fill(+size.replace(',', '.'));
    return { qty: r3(packs.reduce((a, b) => a + b, 0)), unit: unit.toLowerCase() as Unit, packs };
  };
  const lotBefore = input.match(new RegExp(`^${lot}\\s+(.+)$`, 'i'));
  if (lotBefore && +lotBefore[1] > 0) return { name: lotBefore[4], ...lots(lotBefore[1], lotBefore[2], lotBefore[3]) };
  const lotAfter = input.match(new RegExp(`^(.+?)\\s+${lot}$`, 'i'));
  if (lotAfter && +lotAfter[2] > 0) return { name: lotAfter[1], ...lots(lotAfter[2], lotAfter[3], lotAfter[4]) };
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
  // lots seulement si l'unité choisie est celle tapée (« 2x250g »)
  const packs = unit && unit === parsed.unit ? parsed.packs : undefined;
  const clean = name.trim();
  if (!clean) return;
  const aisleId = aisle ?? (await aisleFor(clean));
  const loc = locationId ?? guessLocation(aisleId);
  const existing = (await db.stock.toArray()).find(
    (s) => !s.deleted && s.locationId === loc && keyOf(s.name) === keyOf(clean)
  );
  if (existing) {
    const sameUnit = existing.unit === unit && existing.qty != null && unit !== 'pièce';
    const changes: Partial<StockItem> =
      qty == null
        ? { level: 'suffisamment', qty: undefined, unit: undefined, packs: undefined, thresholdPacks: undefined }
        : sameUnit && (existing.packs || packs)
          ? // produit en lots : ce qu'on ajoute forme un ou plusieurs nouveaux lots
            withPacksAdded(existing, packs ?? [qty])
          : existing.unit === unit && existing.qty != null
            ? { qty: r3(existing.qty + qty) }
            : { qty, unit, level: undefined, packs: undefined, thresholdPacks: undefined, count: undefined, countUnit: undefined, thresholdCount: undefined };
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
    ...(qty == null ? { level: 'suffisamment', thresholdLevel: 'plus beaucoup' } : { qty, unit }),
    ...(packs && { packs, packSize: packs[0] })
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

/* ---------- Lots (plaquettes, bouteilles…) ---------- */

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const sum = (a: number[]) => r3(a.reduce((x, y) => x + y, 0));

/** Lots triés du plus petit (le lot entamé) au plus grand, sans lots vides. */
const sortPacks = (packs: number[]) => packs.map(r3).filter((p) => p > 0).sort((a, b) => a - b);

/** Modifications pour remplacer les lots (qty suit, la contenance proposée devient le dernier lot ajouté). */
function setPacks(item: StockItem, packs: number[]): Partial<StockItem> {
  const added = packs.length > (item.packs?.length ?? 0) ? packs[packs.length - 1] : undefined;
  const sorted = sortPacks(packs);
  return { packs: sorted, qty: sum(sorted), ...(added && { packSize: added }) };
}

/** Découpe une quantité en lots de `size` ; le reste forme un lot entamé. 600 g / 250 → [100, 250, 250]. */
export function splitPacks(qty: number, size: number): number[] {
  if (!(size > 0) || !(qty > 0)) return [];
  const full = Math.floor(qty / size + 1e-9);
  return sortPacks([...Array<number>(full).fill(size), qty - full * size]);
}

/**
 * Modifications pour amener le stock à `qty`. Avec des lots : une baisse puise dans le plus petit
 * (l'entamé) d'abord ; une hausse forme de nouveaux lots de la contenance habituelle.
 */
export function withQty(item: StockItem, qty: number): Partial<StockItem> {
  qty = Math.max(0, r3(qty));
  if (!item.packs) return { qty };
  const packs = sortPacks(item.packs);
  const cur = sum(packs);
  if (qty >= cur) {
    const size = item.packSize ?? qty - cur;
    return { qty, packs: sortPacks([...packs, ...splitPacks(qty - cur, size)]) };
  }
  let take = r3(cur - qty);
  while (take > 0 && packs.length) {
    if (packs[0] <= take) take = r3(take - packs.shift()!);
    else {
      packs[0] = r3(packs[0] - take);
      take = 0;
    }
  }
  return { qty: sum(packs), packs: sortPacks(packs) };
}

/** Ajoute des lots ; un produit qui n'en avait pas est d'abord découpé à la même contenance. */
function withPacksAdded(item: StockItem, added: number[]): Partial<StockItem> {
  const base = item.packs ?? splitPacks(item.qty ?? 0, added[0]);
  return setPacks({ ...item, packs: base }, [...base, ...added]);
}

/** Ajoute `count` lots de `size` (unité du produit). */
export const addPacks = (item: StockItem, count: number, size: number): Partial<StockItem> =>
  setPacks(item, [...(item.packs ?? []), ...Array<number>(count).fill(size)]);

/** « 2 plaquettes », « 1 lot ». */
export function formatPacks(s: StockItem): string {
  if (!s.packs) return '';
  const n = s.packs.length;
  const name = s.packName?.trim() || 'lot';
  return `${n} ${n > 1 && !/[sx]$/i.test(name) ? name + 's' : name}`;
}

/** Bouton − / + : pas adapté à l'unité, niveau suivant / précédent, ou un lot entier. */
export function adjust(item: StockItem, dir: 1 | -1) {
  if (item.level) {
    const i = Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(item.level) + dir));
    return updateStock(item.id, { level: LEVELS[i] as Level });
  }
  if (item.packs) {
    // − retire le plus petit lot (l'entamé), + en ajoute un de la contenance habituelle
    const packs = sortPacks(item.packs);
    if (dir < 0) return updateStock(item.id, setPacks(item, packs.slice(1)));
    const size = item.packSize ?? packs[packs.length - 1];
    return size ? updateStock(item.id, addPacks(item, 1, size)) : undefined;
  }
  const step = STEP[item.unit ?? 'pièce'];
  const qty = Math.max(0, Math.round(((item.qty ?? 0) + dir * step) * 1000) / 1000);
  return updateStock(item.id, { qty });
}

const amount = (qty: number, unit?: Unit) => `${String(qty).replace('.', ',')}${unit && unit !== 'pièce' ? ' ' + unit : ''}`;

export const formatQty = (s: StockItem): string =>
  s.level ? s.level + (s.count == null ? '' : ` · ${amount(s.count, s.countUnit)}`) : s.qty == null ? '' : amount(s.qty, s.unit);

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
    if (s?.packs && s.packSize) {
      // produit en lots : on compte les lots achetés
      const u = bought.unit ?? 'pièce';
      const inUnit = u === 'pièce' ? undefined : convert(bought.qty ?? 0, u, s.unit ?? 'pièce');
      qty = String(inUnit != null ? Math.max(1, Math.round(inUnit / s.packSize)) : (bought.qty ?? 1));
    } else if (s && !s.level && bought.qty != null) {
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
      if (cur?.packs && cur.packSize) await updateStock(s.id, addPacks(cur, Math.max(1, Math.round(q)), cur.packSize));
      else await updateStock(s.id, { qty: Math.round(((cur?.qty ?? 0) + q) * 1000) / 1000 });
    }
    n++;
  }
  return n;
}

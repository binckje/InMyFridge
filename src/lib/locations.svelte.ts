import { liveQuery } from 'dexie';
import { db, newId } from './db';
import type { Category, Location, StoredLocation } from './types';

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

/** Emplacements par défaut (identifiants fixes, voir seedLocations). */
export const DEFAULT_LOCATIONS: Location[] = [
  { id: 'frigo', label: 'Réfrigérateur', emoji: '🧊', categories: COLD },
  { id: 'congelateur', label: 'Congélateur', emoji: '❄️', categories: COLD },
  { id: 'epicerie-salee', label: 'Épicerie salée', emoji: '🥫' },
  { id: 'epicerie-sucree', label: 'Épicerie sucrée', emoji: '🍫' },
  { id: 'autres', label: 'Autres', emoji: '📦' },
  { id: 'menager', label: 'Produits ménagers', emoji: '🧽' }
];

/**
 * Emplacements configurés, dans l'ordre. État réactif : les écrans se mettent à jour
 * dès qu'un emplacement est modifié (ici ou par la synchro).
 */
export const LOCATIONS: Location[] = $state(DEFAULT_LOCATIONS.map((l) => ({ ...l })));

/** Recharge LOCATIONS depuis la base (appelé au démarrage puis à chaque changement). */
export function watchLocations() {
  return liveQuery(() => db.locations.orderBy('order').filter((l) => !l.deleted).toArray()).subscribe((list) => {
    if (list.length) LOCATIONS.splice(0, LOCATIONS.length, ...list);
  });
}

/** Installe les emplacements par défaut au premier lancement. */
export async function seedLocations() {
  const existing = new Set((await db.locations.toCollection().primaryKeys()) as string[]);
  const todo = DEFAULT_LOCATIONS.filter((l) => !existing.has(l.id));
  if (existing.size || !todo.length) return;
  await db.locations.bulkAdd(DEFAULT_LOCATIONS.map((l, order) => ({ ...l, order, updatedAt: 0 })));
}

export const locationById = (id: string): Location => LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];

export const categoryOf = (loc: Location, id?: string): Category | undefined =>
  loc.categories?.length ? (loc.categories.find((c) => c.id === id) ?? loc.categories.at(-1)) : undefined;

/** Emplacement probable d'après le rayon deviné (s'il existe encore). */
export function guessLocation(aisleId: string): string {
  const map: Record<string, string> = {
    surgeles: 'congelateur',
    'epicerie-salee': 'epicerie-salee',
    'epicerie-sucree': 'epicerie-sucree',
    menager: 'menager',
    autre: 'autres'
  };
  return locationById(map[aisleId] ?? 'frigo').id;
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

/* ---------- Configuration ---------- */

async function save(list: Location[]) {
  const now = Date.now();
  await db.locations.bulkPut(list.map((l, order) => ({ ...$state.snapshot(l), order, updatedAt: now }) as StoredLocation));
}

export async function updateLocation(id: string, changes: Partial<Location>) {
  await db.locations.update(id, { ...$state.snapshot(changes), updatedAt: Date.now() } as Partial<StoredLocation>);
}

export async function addLocation(label: string, emoji = '📦'): Promise<string> {
  const id = newId();
  const order = Math.max(-1, ...((await db.locations.toArray()).map((l) => l.order))) + 1;
  await db.locations.add({ id, label: label.trim(), emoji, order, updatedAt: Date.now() });
  return id;
}

/** Déplace un emplacement d'un cran (dir = -1 vers le haut, 1 vers le bas). */
export async function moveLocation(id: string, dir: -1 | 1) {
  const list = [...LOCATIONS];
  const i = list.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await save(list);
}

/** Supprime un emplacement vide. Retourne le nombre de produits qui l'en empêchent. */
export async function deleteLocation(id: string): Promise<number> {
  const used = await db.stock.filter((s) => !s.deleted && s.locationId === id).count();
  if (used) return used;
  if (LOCATIONS.length <= 1) return -1;
  await db.locations.update(id, { deleted: true, updatedAt: Date.now() });
  return 0;
}

export function newCategory(label: string, emoji = '📦'): Category {
  return { id: newId(), label: label.trim(), emoji };
}

import { liveQuery } from 'dexie';
import { db } from './db';
import { exportData } from './backup';
import { getState } from './drive';
import { syncWith, type Snapshot } from './sync';

/* ---------- Modifications non sauvegardées ---------- */

const BACKUP_KEY = 'inmyfridge-last-backup';
const SAVED_EVENT = 'inmyfridge-saved';

/** Date de la dernière modification locale (tous types de données confondus). */
export async function lastLocalChange(): Promise<number> {
  const last = await Promise.all([
    db.stock.orderBy('updatedAt').last(),
    db.shopping.orderBy('updatedAt').last(),
    db.recipes.orderBy('updatedAt').last(),
    db.products.orderBy('updatedAt').last(),
    db.locations.orderBy('updatedAt').last()
  ]);
  const memory = await db.memory.orderBy('lastUsed').last();
  return Math.max(0, memory?.lastUsed ?? 0, ...last.map((r) => r?.updatedAt ?? 0));
}

/** Observable (Dexie) de la dernière modification locale. */
export const localChange = liveQuery(lastLocalChange);

/** Dernière mise à l'abri des données : synchro Drive ou fichier de sauvegarde téléchargé. */
export function lastSaved(): number {
  return Math.max(getState().lastSync ?? 0, Number(localStorage.getItem(BACKUP_KEY)) || 0);
}

/** À appeler après une synchro réussie ou un téléchargement de sauvegarde. */
export function markSaved(backup = false) {
  if (backup) localStorage.setItem(BACKUP_KEY, String(Date.now()));
  window.dispatchEvent(new Event(SAVED_EVENT));
}

export const onSaved = (fn: () => void) => window.addEventListener(SAVED_EVENT, fn);

/* ---------- Copies automatiques sur l'appareil ---------- */

const KEEP = 10;
const EVERY = 60 * 60_000;

/**
 * Enregistre une copie complète des données s'il y a eu des modifications depuis la dernière copie,
 * au plus une par heure (ou en quittant l'app). Garde les 10 dernières.
 */
export async function takeSnapshot(force = false) {
  const prev = await db.snapshots.orderBy('id').last();
  const changed = await lastLocalChange();
  if (prev && changed <= prev.id) return false;
  if (prev && !force && Date.now() - prev.id < EVERY) return false;
  const data = await exportData();
  await db.snapshots.put({ id: Date.now(), data });
  const ids = await db.snapshots.orderBy('id').primaryKeys();
  if (ids.length > KEEP) await db.snapshots.bulkDelete(ids.slice(0, ids.length - KEEP));
  return true;
}

export const listSnapshots = () => db.snapshots.orderBy('id').reverse().toArray();

/** Nombre d'éléments (non supprimés) dans une copie, pour l'affichage. */
export const snapshotSize = (s: Snapshot) =>
  [s.stock, s.shopping, s.recipes ?? []].reduce((n, list) => n + list.filter((i) => !i.deleted).length, 0);

/** Fusionne une copie avec les données actuelles (la version la plus récente de chaque élément gagne). */
export async function restoreSnapshot(id: number): Promise<number> {
  const snap = await db.snapshots.get(id);
  if (!snap) return 0;
  const { received } = await syncWith({ read: async () => snap.data, write: async () => {} });
  return received;
}

/** Copie toutes les 15 min (si 1 h écoulée) et en quittant l'app ; alerte du navigateur si rien n'est sauvegardé. */
export function startSafety() {
  setTimeout(() => takeSnapshot(), 5000);
  setInterval(() => takeSnapshot(), 15 * 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') takeSnapshot(true);
  });
  let changed = 0;
  localChange.subscribe((t) => (changed = t));
  window.addEventListener('beforeunload', (e) => {
    if (changed > lastSaved()) e.preventDefault();
  });
}

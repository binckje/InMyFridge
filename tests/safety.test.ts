import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';
import { addStock } from '../src/lib/stock';
import { lastLocalChange, lastSaved, listSnapshots, markSaved, restoreSnapshot, takeSnapshot } from '../src/lib/safety';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear()
});
vi.stubGlobal('window', new EventTarget());

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
  vi.useRealTimers();
});

it('modification locale plus récente que la dernière sauvegarde', async () => {
  await addStock('lait 1 l', 'frigo');
  expect(await lastLocalChange()).toBeGreaterThan(lastSaved());
  markSaved(true);
  expect(await lastLocalChange()).toBeLessThanOrEqual(lastSaved());
});

it('copie seulement après modification, 1 par heure, 10 gardées', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await addStock('lait 1 l', 'frigo');
  expect(await takeSnapshot()).toBe(true);
  expect(await takeSnapshot(true)).toBe(false); // rien de nouveau
  vi.advanceTimersByTime(1000);
  await addStock('riz 1 kg', 'epicerie-salee');
  expect(await takeSnapshot()).toBe(false); // moins d'1 h
  for (let i = 0; i < 12; i++) {
    vi.advanceTimersByTime(60 * 60_000);
    await addStock(`produit ${i}`, 'autres');
    expect(await takeSnapshot()).toBe(true);
  }
  expect(await listSnapshots()).toHaveLength(10);
});

it('restaure une copie après perte des données', async () => {
  await addStock('lait 1 l', 'frigo');
  await takeSnapshot();
  const [snap] = await listSnapshots();
  await db.stock.clear();
  expect(await restoreSnapshot(snap.id)).toBe(1);
  expect((await db.stock.toArray())[0].name).toBe('lait');
});

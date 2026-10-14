import { beforeEach, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { exportData, importBackup } from '../src/lib/backup';
import { addStock } from '../src/lib/stock';
import { seedRecipes } from '../src/lib/recipes';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

it('export puis import sur un appareil vide', async () => {
  await addStock('lait 1 l', 'frigo');
  await seedRecipes();
  const json = JSON.stringify(await exportData());
  await Promise.all(db.tables.map((t) => t.clear()));
  const n = await importBackup(json);
  expect(n).toBeGreaterThan(30);
  expect((await db.stock.toArray())[0].name).toBe('lait');
  await expect(importBackup('{"foo":1}')).rejects.toThrow('Fichier non reconnu.');
});

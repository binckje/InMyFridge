import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { guessAisle } from '../src/lib/aisles';
import { addStock, adjust, formatQty, parseStock } from '../src/lib/stock';
import { addItem, isLow, syncLowStock } from '../src/lib/shopping';
import { syncWith, type Snapshot, type SyncProvider } from '../src/lib/sync';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('parseStock', () => {
  it('reconnaît quantité et unité avant ou après le nom', () => {
    expect(parseStock('lait 2 l')).toEqual({ name: 'lait', qty: 2, unit: 'l' });
    expect(parseStock('500g pâtes')).toEqual({ name: 'pâtes', qty: 500, unit: 'g' });
    expect(parseStock('oeufs x6')).toEqual({ name: 'oeufs', qty: 6, unit: 'pièce' });
    expect(parseStock('riz 1,5 kg')).toEqual({ name: 'riz', qty: 1.5, unit: 'kg' });
    expect(parseStock('beurre')).toEqual({ name: 'beurre' });
  });
});

describe('guessAisle', () => {
  it('devine le rayon, le mot-clé le plus long gagne', () => {
    expect(guessAisle('Lait demi-écrémé')).toBe('cremerie');
    expect(guessAisle('fromage blanc')).toBe('laiterie-dessert');
    expect(guessAisle('truc inconnu')).toBe('autre');
  });
});

describe('stock', () => {
  it('additionne si même produit et même unité', async () => {
    await addStock('lait 1 l', 'frigo');
    const s = await addStock('Lait 2 l', 'frigo');
    expect(s?.qty).toBe(3);
    expect(await db.stock.count()).toBe(1);
  });

  it('formate et ajuste', async () => {
    const s = (await addStock('riz 1 kg', 'epicerie-salee'))!;
    expect(formatQty(s)).toBe('1 kg');
    await adjust(s, -1);
    expect((await db.stock.get(s.id))?.qty).toBe(0.75);
  });

  it('sous le seuil → ajouté aux courses, remonté → retiré', async () => {
    const s = (await addStock('beurre', 'frigo'))!;
    expect(s.level).toBe('suffisamment');
    await adjust(s, -1);
    await adjust({ ...s, level: 'moyen' }, -1);
    const low = (await db.stock.get(s.id))!;
    expect(isLow(low)).toBe(true);
    let list = (await db.shopping.toArray()).filter((i) => !i.deleted);
    expect(list.map((i) => i.name)).toEqual(['beurre']);
    await adjust(low, 1);
    await syncLowStock();
    list = (await db.shopping.toArray()).filter((i) => !i.deleted);
    expect(list).toHaveLength(0);
  });
});

describe('courses', () => {
  it('pas de doublon', async () => {
    await addItem('Pâtes', '500 g');
    await addItem('pates', '1 kg');
    const list = await db.shopping.toArray();
    expect(list).toHaveLength(1);
    expect(list[0].qty).toBe('1 kg');
  });
});

describe('sync', () => {
  it('fusionne : dernière modification gagne', async () => {
    await addItem('pain');
    const local = (await db.shopping.toArray())[0];
    let stored: Snapshot | null = {
      version: 1,
      savedAt: 0,
      stock: [],
      shopping: [{ ...local, name: 'pain complet', updatedAt: local.updatedAt + 10 }],
      memory: []
    };
    const provider: SyncProvider = {
      read: async () => stored,
      write: async (s) => {
        stored = s;
      }
    };
    const r = await syncWith(provider);
    expect(r.received).toBe(1);
    expect((await db.shopping.get(local.id))?.name).toBe('pain complet');
    expect(stored!.shopping).toHaveLength(1);
  });
});

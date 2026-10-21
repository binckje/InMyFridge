import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { guessAisle } from '../src/lib/aisles';
import { addStock, adjust, formatQty, parseStock, saveGroup, updateStock } from '../src/lib/stock';
import { addItem, groupTotal, isEmptyUntracked, isLow, isOut, syncLowStock } from '../src/lib/shopping';
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

describe('groupes', () => {
  const todo = async () => (await db.shopping.toArray()).filter((i) => !i.deleted);

  it('seuil en quantité : total converti, seuils individuels ignorés', async () => {
    const g = await saveGroup('Fromage', { mode: 'qty', unit: 'g', threshold: 200 });
    const a = (await addStock('emmental 150 g', 'frigo'))!;
    const b = (await addStock('comté 0,1 kg', 'frigo'))!;
    await updateStock(a.id, { groupId: g, thresholdQty: 500 });
    await updateStock(b.id, { groupId: g });
    const stock = await db.stock.toArray();
    expect(groupTotal((await db.groups.get(g))!, stock)).toBe(250);
    expect(await todo()).toHaveLength(0);
    await updateStock(b.id, { qty: 0.05 });
    expect((await todo()).map((i) => [i.name, i.groupId])).toEqual([['Fromage', g]]);
    await updateStock(a.id, { qty: 400 });
    expect(await todo()).toHaveLength(0);
  });

  it('seuil en nombre de produits', async () => {
    const g = await saveGroup('Pâtes', { mode: 'count', threshold: 1 });
    const a = (await addStock('spaghetti', 'epicerie-salee'))!;
    const b = (await addStock('penne', 'epicerie-salee'))!;
    await updateStock(a.id, { groupId: g });
    await updateStock(b.id, { groupId: g });
    expect(await todo()).toHaveLength(0);
    await updateStock(b.id, { level: 'plus beaucoup' });
    expect((await todo()).map((i) => i.name)).toEqual(['Pâtes']);
  });

  it('même nom → même groupe', async () => {
    const a = await saveGroup('Fromage', { mode: 'count', threshold: 1 });
    const b = await saveGroup(' fromage ', { mode: 'qty', unit: 'g', threshold: 100 });
    expect(b).toBe(a);
    expect(await db.groups.count()).toBe(1);
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
  it('conflit : relit et refusionne sans perdre l’écriture de l’autre appareil', async () => {
    const { SyncConflict } = await import('../src/lib/sync');
    await addItem('pain');
    const other = { id: 'b', name: 'beurre', aisleId: 'cremerie', checked: false, createdAt: 1, updatedAt: 1 };
    let stored: Snapshot | null = { version: 1, savedAt: 0, stock: [], shopping: [], memory: [] };
    let conflictOnce = true;
    const provider: SyncProvider = {
      read: async () => stored,
      write: async (s) => {
        if (conflictOnce) {
          conflictOnce = false;
          stored = { ...stored!, shopping: [other] }; // l'autre appareil écrit entre-temps
          throw new SyncConflict();
        }
        stored = s;
      }
    };
    await syncWith(provider);
    expect(stored!.shopping.map((i) => i.name).sort()).toEqual(['beurre', 'pain']);
  });

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

describe('ranger les courses', () => {
  it('quantités converties, niveaux remis à « suffisamment », nouveaux produits', async () => {
    const { planRestock, applyRestock, convert } = await import('../src/lib/stock');
    expect(convert(500, 'g', 'kg')).toBe(0.5);
    expect(convert(1, 'l', 'g')).toBeUndefined();
    const riz = (await addStock('riz 0,2 kg', 'epicerie-salee'))!;
    const beurre = (await addStock('beurre', 'frigo'))!;
    await addItem('riz', '500 g');
    await addItem('beurre');
    await addItem('pain');
    const lines = (await planRestock(await db.shopping.toArray())).sort((a, b) => a.name.localeCompare(b.name));
    expect(lines.map((l) => [l.name, l.qty, l.include])).toEqual([
      ['beurre', '', true],
      ['pain', '', false],
      ['riz', '0,5', true]
    ]);
    await adjust(beurre, -1);
    lines[1].include = true;
    await db.stock.update(riz.id, { qty: 0.1 }); // modifié pendant que la feuille est ouverte
    expect(await applyRestock(lines)).toBe(3);
    expect((await db.stock.get(riz.id))?.qty).toBe(0.6);
    expect((await db.stock.get(beurre.id))?.level).toBe('suffisamment');
    expect((await db.stock.toArray()).some((s) => s.name === 'pain')).toBe(true);
  });
});

describe('lots', () => {
  it('lit « 2x250g » et découpe une quantité', async () => {
    const { splitPacks } = await import('../src/lib/stock');
    expect(parseStock('2x250g beurre')).toEqual({ name: 'beurre', qty: 500, unit: 'g', packs: [250, 250] });
    expect(parseStock('beurre 2 x 250 g')?.packs).toEqual([250, 250]);
    expect(splitPacks(600, 250)).toEqual([100, 250, 250]);
  });

  it('ajoute un lot de 500 g, puise dans l’entamé, retire un lot entier', async () => {
    const { withQty, formatPacks } = await import('../src/lib/stock');
    let s = (await addStock('2x250g beurre', 'frigo'))!;
    await db.stock.update(s.id, { packName: 'plaquette' });
    s = (await addStock('beurre 500 g', 'frigo'))!;
    s = (await db.stock.get(s.id))!;
    expect(s.packs).toEqual([250, 250, 500]);
    expect(s.qty).toBe(1000);
    expect(formatPacks(s)).toBe('3 plaquettes');
    // 100 g utilisés : pris sur le plus petit lot
    expect(withQty(s, 900)).toEqual({ qty: 900, packs: [150, 250, 500] });
    // 300 g utilisés : un lot vidé, le suivant entamé
    expect(withQty(s, 700)).toEqual({ qty: 700, packs: [200, 500] });
    await adjust(s, -1);
    expect((await db.stock.get(s.id))?.packs).toEqual([250, 500]);
  });

  it('produit suivi par niveau : seuil sur la quantité', async () => {
    let s = (await addStock('café', 'placard'))!;
    await db.stock.update(s.id, { level: 'suffisamment', thresholdLevel: undefined, count: 3, countUnit: 'pièce', thresholdCount: 2 });
    s = (await db.stock.get(s.id))!;
    expect(isLow(s)).toBe(false);
    expect(formatQty(s)).toBe('suffisamment · 3');
    expect(isLow({ ...s, count: 2 })).toBe(true);
    expect(isLow({ ...s, count: 3, thresholdLevel: 'moyen', level: 'moyen' })).toBe(true);
  });

  it('seuil en nombre de lots', async () => {
    let s = (await addStock('2x250g beurre', 'frigo'))!;
    await db.stock.update(s.id, { thresholdPacks: 1 });
    s = (await db.stock.get(s.id))!;
    expect(isLow(s)).toBe(false);
    await adjust(s, -1);
    expect(isLow((await db.stock.get(s.id))!)).toBe(true);
  });

  it('ranger les courses : compte en lots', async () => {
    const { planRestock, applyRestock } = await import('../src/lib/stock');
    const s = (await addStock('1x250g beurre', 'frigo'))!;
    await addItem('beurre', '2');
    const lines = await planRestock(await db.shopping.toArray());
    expect(lines[0].qty).toBe('2');
    await applyRestock(lines);
    expect((await db.stock.get(s.id))?.packs).toEqual([250, 250, 250]);
  });
});

describe('produits épuisés sans seuil', () => {
  const base = { id: 'x', updatedAt: 0, name: 'x', locationId: 'frigo', aisleId: 'a' };
  it('masqué seulement à zéro et sans seuil (ni groupe avec seuil)', () => {
    const g = { id: 'g', updatedAt: 0, name: 'g', mode: 'count' as const, threshold: 1 };
    expect(isEmptyUntracked({ ...base, qty: 0, unit: 'g' }, [])).toBe(true);
    expect(isEmptyUntracked({ ...base, qty: 100, unit: 'g' }, [])).toBe(false);
    expect(isEmptyUntracked({ ...base, qty: 0, unit: 'g', thresholdQty: 50 }, [])).toBe(false);
    expect(isEmptyUntracked({ ...base, level: 'plus beaucoup' }, [])).toBe(false);
    expect(isEmptyUntracked({ ...base, qty: 0, groupId: 'g' }, [g])).toBe(false);
    expect(isEmptyUntracked({ ...base, qty: 0, groupId: 'g' }, [{ ...g, threshold: undefined }])).toBe(true);
  });
});

describe('produit épuisé', () => {
  const base = { id: 'x', updatedAt: 0, name: 'x', locationId: 'frigo', aisleId: 'a' };
  it('inexistant à 0, stock bas sinon', () => {
    expect(isOut({ ...base, qty: 0, unit: 'g' })).toBe(true);
    expect(isOut({ ...base, qty: 50, unit: 'g' })).toBe(false);
    expect(isOut({ ...base, level: 'plus beaucoup' })).toBe(false);
    expect(isOut({ ...base, level: 'moyen', count: 0 })).toBe(true);
  });
});

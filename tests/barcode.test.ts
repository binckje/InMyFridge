import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';
import { aisleFromCategories, lookup, rememberProduct, validCode } from '../src/lib/barcode';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(() => vi.unstubAllGlobals());

describe('validCode', () => {
  it('vérifie le chiffre de contrôle EAN', () => {
    expect(validCode('3017620422003')).toBe(true); // Nutella
    expect(validCode('3017620422004')).toBe(false);
    expect(validCode('96385074')).toBe(true); // EAN-8
    expect(validCode('12345')).toBe(false);
  });
});

describe('aisleFromCategories', () => {
  it('catégories Open Food Facts → rayon', () => {
    expect(aisleFromCategories(['en:spreads', 'en:sweet-spreads', 'en:chocolates'], 'Nutella')).toBe('epicerie-sucree');
    expect(aisleFromCategories(['en:dairies', 'en:milks'], 'Lait')).toBe('cremerie');
    expect(aisleFromCategories(['en:frozen-foods', 'en:pizzas'], 'Pizza')).toBe('surgeles');
    expect(aisleFromCategories([], 'pâtes')).toBe('epicerie-salee');
  });
});

describe('lookup', () => {
  it('Open Food Facts puis mémoire locale', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name_fr: 'Pâte à tartiner',
          brands: 'Nutella, Ferrero',
          quantity: '400 g',
          categories_tags: ['en:chocolates']
        }
      })
    }));
    vi.stubGlobal('fetch', fetch);
    const p = await lookup('3017620422003');
    expect(p).toMatchObject({ name: 'Pâte à tartiner', brand: 'Nutella', qty: 400, unit: 'g', aisleId: 'epicerie-sucree' });
    await rememberProduct({ ...p!, name: 'Nutella' });
    expect((await lookup('3017620422003'))?.name).toBe('Nutella');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('inconnu ou hors ligne → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 0 }) })));
    expect(await lookup('96385074')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await lookup('96385074')).toBeNull();
  });
});

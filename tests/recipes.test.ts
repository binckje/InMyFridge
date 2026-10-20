import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { addStock } from '../src/lib/stock';
import {
  checkIngredient,
  addMissingToShopping,
  categoryOf,
  setCategory,
  withCategory,
  checkRecipe,
  cook,
  formatIngredient,
  isBasic,
  matches,
  matchKind,
  parseIngredient,
  seedRecipes,
  undoCook,
  yieldLabel
} from '../src/lib/recipes';
import { SEED_RECIPES } from '../src/lib/recipes-seed';
import type { Recipe, StockItem } from '../src/lib/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('parseIngredient', () => {
  it('quantité, unité, « de »', () => {
    expect(parseIngredient('200 g de farine')).toEqual({ name: 'farine', qty: 200, unit: 'g' });
    expect(parseIngredient('3 oeufs')).toEqual({ name: 'oeufs', qty: 3, unit: 'pièce' });
    expect(parseIngredient('2 c. à soupe d’huile')).toEqual({ name: 'huile', qty: 2, unit: 'c. à soupe' });
    expect(parseIngredient('1 cube de bouillon')).toEqual({ name: 'bouillon', qty: 1, unit: 'cube' });
    expect(parseIngredient('sel')).toEqual({ name: 'sel' });
    expect(parseIngredient('1 gousse d’ail')).toEqual({ name: 'ail', qty: 1, unit: 'gousse' });
    expect(parseIngredient('2 gros oignons')).toEqual({ name: 'gros oignons', qty: 2, unit: 'pièce' });
    expect(parseIngredient('2 laitues')).toEqual({ name: 'laitues', qty: 2, unit: 'pièce' });
    expect(parseIngredient('200g farine')).toEqual({ name: 'farine', qty: 200, unit: 'g' });
    expect(parseIngredient('1/2 citron')).toMatchObject({ name: 'citron', qty: 0.5 });
    expect(parseIngredient('50 g fromage (facultatif)')).toMatchObject({ name: 'fromage', optional: true });
  });

  it('toutes les recettes de base se lisent', () => {
    for (const r of SEED_RECIPES)
      for (const line of r.ingredients) {
        const i = parseIngredient(line);
        expect(i.name, `${r.id}: ${line}`).not.toMatch(/^(de|d’|d')\s/);
        expect(i.name.length, `${r.id}: ${line}`).toBeGreaterThan(1);
      }
  });

  it('formatIngredient', () => {
    expect(formatIngredient(parseIngredient('200 g farine'), 2)).toBe('400 g farine');
    expect(formatIngredient(parseIngredient('2 c. à soupe d’huile'))).toBe("2 c. à soupe d'huile");
  });
});

describe('matches', () => {
  it('pluriels, accents, mots en plus dans le stock', () => {
    expect(matches('oeufs', 'Œuf')).toBe(true);
    expect(matches('lait', 'Lait demi-écrémé')).toBe(true);
    expect(matches('crème fraîche', 'creme fraiche épaisse')).toBe(true);
    expect(matches('beurre', 'pain')).toBe(false);
  });
  it('produits précis → nom générique', () => {
    expect(matches('pâtes', 'Spaghetti n°5')).toBe(true);
    expect(matches('fromage râpé', 'Emmental râpé')).toBe(true);
    expect(matches('boeuf haché', 'steak haché')).toBe(true);
    expect(matches('huile', "huile de tournesol")).toBe(true);
    expect(matches('emmental', 'comté')).toBe(false);
  });
  it('noms composés', () => {
    expect(matches('pommes', 'pommes de terre')).toBe(false);
    expect(matches('pommes de terre', 'pomme de terre')).toBe(true);
    expect(matches('lait', 'lait de coco')).toBe(false);
  });
});

describe('checkRecipe / cook', () => {
  it('faisable, manquants, quantités insuffisantes, sel ignoré', async () => {
    await seedRecipes();
    const omelette = (await db.recipes.get('base-omelette'))!;
    await addStock('oeufs 6', 'frigo');
    await addStock('beurre', 'frigo');
    let c = checkRecipe(omelette, await db.stock.toArray());
    expect(c.feasible).toBe(false);
    expect(c.missing.map((m) => m.ingredient.name)).toEqual(['fromage râpé']);
    await addStock('fromage râpé 200 g', 'frigo');
    c = checkRecipe(omelette, await db.stock.toArray());
    expect(c.feasible).toBe(true);
    // pour 4 personnes au lieu de 2 : 8 oeufs → insuffisant
    expect(checkRecipe(omelette, await db.stock.toArray(), 2).missing.map((m) => m.status)).toEqual(['low']);
  });

  it('cuisiner retire les quantités, annulable', async () => {
    await seedRecipes();
    const omelette = (await db.recipes.get('base-omelette'))!;
    const eggs = (await addStock('oeufs 6', 'frigo'))!;
    const butter = (await addStock('beurre', 'frigo'))!;
    await addStock('fromage râpé 200 g', 'frigo');
    const done = await cook(checkRecipe(omelette, await db.stock.toArray()));
    expect((await db.stock.get(eggs.id))?.qty).toBe(2);
    expect((await db.stock.get(butter.id))?.level).toBe('moyen');
    await undoCook(done);
    expect((await db.stock.get(eggs.id))?.qty).toBe(6);
    expect((await db.stock.get(butter.id))?.level).toBe('suffisamment');
  });

  it('cuisiner : deux ingrédients sur le même produit', async () => {
    const eggs = (await addStock('oeufs 10', 'frigo'))!;
    const r = { id: 'x', name: 'x', servings: 1, steps: [], source: 'perso' as const, createdAt: 0, updatedAt: 0,
      ingredients: [parseIngredient('2 oeufs'), parseIngredient('1 oeuf')] };
    const done = await cook(checkRecipe(r, await db.stock.toArray()));
    expect((await db.stock.get(eggs.id))?.qty).toBe(7);
    await undoCook(done);
    expect((await db.stock.get(eggs.id))?.qty).toBe(10);
  });

  it('manquants → liste de courses', async () => {
    await seedRecipes();
    const crepes = (await db.recipes.get('base-crepes'))!;
    const n = await addMissingToShopping(checkRecipe(crepes, []));
    expect(n).toBe(4);
    const list = (await db.shopping.toArray()).map((i) => `${i.name}:${i.qty ?? ''}`).sort();
    expect(list).toEqual(['beurre:50 g', 'farine:250 g', 'lait:500 ml', 'oeufs:4']);
  });

  it('variantes : remplacement signalé, cuillères converties, choix du produit', async () => {
    expect(matchKind('sucre roux', 'sucre')).toBe('close');
    expect(matchKind('sucre roux', 'cassonade')).toBe('exact');
    expect(matchKind('cassonade', 'sucre roux')).toBe('exact');
    expect(matchKind('sucre blanc', 'cassonade')).toBe('close');
    expect(matchKind('sucre en poudre', 'sucre semoule')).toBe('exact');
    expect(matchKind('sucre', 'cassonade')).toBe('exact');
    expect(matchKind('farine de blé', 'farine')).toBe('exact');
    expect(matchKind('farine T55', 'farine T45')).toBe('substitute');
    expect(matchKind('sucre vanillé', 'sucre')).toBeUndefined();
    expect(matchKind('pomme', 'pomme de terre')).toBeUndefined();
    expect(matchKind('huile d’olive', 'huile de tournesol')).toBe('close');
    expect(matchKind('vin blanc', 'vin rouge')).toBe('close');

    expect(parseIngredient('2 cuillères à soupe de sucre roux')).toEqual({ name: 'sucre roux', qty: 2, unit: 'cuillères à soupe' });

    const white = (await addStock('sucre 1 kg', 'placard'))!;
    const brown = (await addStock('cassonade 30 g', 'placard'))!;
    const oil = (await addStock('huile 1 l', 'placard'))!;
    const r = { id: 'x', name: 'x', servings: 1, steps: [], source: 'perso' as const, createdAt: 0, updatedAt: 0,
      ingredients: [parseIngredient('2 c. à s. de sucre roux'), parseIngredient('1 c. à c. d\'huile')] };
    // sucre blanc : simple suggestion, sauf si l'utilisateur l'accepte (💡 Utiliser)
    expect(checkRecipe(r, await db.stock.toArray()).checks[0].stock.map((s) => s.id)).toEqual([brown.id]);
    const c = checkRecipe(r, await db.stock.toArray(), 1, new Set([0]));
    // cassonade : bonne variante mais 30 g, le sucre blanc complète (24 g demandés)
    expect(c.checks[0].stock.map((s) => s.id)).toEqual([brown.id, white.id]);
    expect(c.checks[0].substitute).toBeUndefined();
    expect(c.feasible).toBe(true);
    await cook(c, 1, { 0: white.id });
    expect((await db.stock.get(white.id))?.qty).toBe(0.976);
    expect((await db.stock.get(brown.id))?.qty).toBe(30);
    expect((await db.stock.get(oil.id))?.qty).toBe(0.995);
    expect(checkRecipe(r, await db.stock.toArray(), 100).checks[0].status).toBe('low');

    await addMissingToShopping(checkRecipe(r, []));
    const list = (await db.shopping.toArray()).map((i) => `${i.name}:${i.qty ?? ''}`).sort();
    expect(list).toEqual(['huile:1 c. à c.', 'sucre roux:2 c. à s.']);
  });

  it('précisions ignorées et choix « / » ou « ou »', () => {
    expect(matchKind('maïzena / fécule de maïs', 'Maizena Fleur de Maïs')).toBe('exact');
    expect(matchKind('fécule de maïs ou maïzena', 'Maïzena')).toBe('exact');
    expect(matchKind('sauce soja légère', 'Sauce de soja')).toBe('exact');
    expect(matchKind('Vinaigre noir chinois', 'Vinaigre Noir')).toBe('exact');
    expect(matchKind('beurre doux', 'beurre')).toBe('exact');
    expect(matchKind('vinaigre noir', 'vinaigre balsamique')).toBe('close');
    const brown = { id: 'b', name: 'cassonade', qty: 500, unit: 'g' } as StockItem;
    const miss = checkIngredient(parseIngredient('100 g sucre blanc'), [brown]);
    expect(miss).toMatchObject({ status: 'missing', close: [brown] });
    expect(checkIngredient(parseIngredient('100 g sucre blanc'), [brown], 1, true)).toMatchObject({ status: 'ok', substitute: true });
  });

  it('seed idempotent, recette supprimée non réinstallée', async () => {
    await seedRecipes();
    const n = await db.recipes.count();
    await db.recipes.update('base-crepes', { deleted: true });
    await seedRecipes();
    expect(await db.recipes.count()).toBe(n);
    expect((await db.recipes.get('base-crepes'))?.deleted).toBe(true);
  });
});

describe('isBasic', () => {
  it('reconnaît sel et poivre même précisés', () => {
    for (const n of ['sel', 'sel (pincée)', 'Sel fin', 'poivre du moulin', 'sel et poivre', 'eau']) expect(isBasic(n), n).toBe(true);
    for (const n of ['sel de céleri', 'poivron', 'eau de fleur d’oranger']) expect(isBasic(n), n).toBe(false);
  });
});

describe('yieldLabel', () => {
  it('affiche des personnes ou des pièces', () => {
    expect(yieldLabel(4)).toBe('4 pers.');
    expect(yieldLabel(20, 'cookies')).toBe('20 cookies');
    expect(yieldLabel(1, 'cookies')).toBe('1 cookie');
  });
});

describe('catégories', () => {
  it('lit la catégorie depuis les étiquettes, accents ignorés', () => {
    expect(categoryOf(['rapide', 'Entree'])).toBe('entrée');
    expect(categoryOf(['rapide'])).toBeUndefined();
  });

  it('remplace l\'étiquette de catégorie sans toucher les autres', () => {
    expect(withCategory(['dessert', 'rapide'], 'plat')).toEqual(['plat', 'rapide']);
    expect(withCategory(['plat', 'rapide'])).toEqual(['rapide']);
  });

  it('classe plusieurs recettes d\'un coup', async () => {
    await db.recipes.bulkPut([
      { id: 'a', name: 'A', servings: 2, ingredients: [], steps: [], tags: ['plat'], createdAt: 0, updatedAt: 0 },
      { id: 'b', name: 'B', servings: 2, ingredients: [], steps: [], createdAt: 0, updatedAt: 0 }
    ] as never);
    await setCategory(['a', 'b'], 'dessert');
    expect((await db.recipes.get('a'))?.tags).toEqual(['dessert']);
    expect((await db.recipes.get('b'))?.tags).toEqual(['dessert']);
  });
});

describe('titres de préparation', () => {
  it('une ligne terminée par « : » n’est pas un ingrédient requis', () => {
    expect(parseIngredient('Pour la pâte :')).toEqual({ name: 'Pour la pâte', section: true });
    expect(formatIngredient(parseIngredient('Garniture:'))).toBe('Garniture :');
    const r = { name: 'T', servings: 1, steps: [], ingredients: ['Pâte :', 'Crème :'].map(parseIngredient) } as unknown as Recipe;
    const c = checkRecipe(r, []);
    expect(c.missing).toHaveLength(0);
    expect(c.feasible).toBe(true);
  });
});

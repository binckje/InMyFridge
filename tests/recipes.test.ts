import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { addStock } from '../src/lib/stock';
import {
  addMissingToShopping,
  checkRecipe,
  cook,
  formatIngredient,
  matches,
  parseIngredient,
  seedRecipes,
  undoCook
} from '../src/lib/recipes';
import { SEED_RECIPES } from '../src/lib/recipes-seed';

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

  it('manquants → liste de courses', async () => {
    await seedRecipes();
    const crepes = (await db.recipes.get('base-crepes'))!;
    const n = await addMissingToShopping(checkRecipe(crepes, []));
    expect(n).toBe(4);
    const list = (await db.shopping.toArray()).map((i) => `${i.name}:${i.qty ?? ''}`).sort();
    expect(list).toEqual(['beurre:50 g', 'farine:250 g', 'lait:500 ml', 'oeufs:4']);
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

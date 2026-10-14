import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWebRecipe, ideasFromStock, toEnglish, toFrench } from '../src/lib/web-recipes';

afterEach(() => vi.unstubAllGlobals());

describe('traduction', () => {
  it('fr ↔ en', () => {
    expect(toEnglish('Pâtes')).toBe('pasta');
    expect(toEnglish('blanc de poulet')).toBeUndefined();
    expect(toEnglish('poulet fermier')).toBe('chicken');
    expect(toEnglish('oeufs')).toBe('egg');
    expect(toFrench('Minced Beef')).toBe('boeuf haché');
    expect(toFrench('Quinoa')).toBe('quinoa');
  });
});

describe('TheMealDB', () => {
  it('convertit une recette', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        meals: [{
          idMeal: '52772',
          strMeal: 'Teriyaki Chicken',
          strCategory: 'Chicken',
          strArea: 'Japanese',
          strInstructions: 'STEP 1\r\nPreheat oven.\r\n2. Mix everything.',
          strIngredient1: 'Chicken Breasts', strMeasure1: '500g',
          strIngredient2: 'Soy Sauce', strMeasure2: '3/4 cup',
          strIngredient3: 'Eggs', strMeasure3: '2',
          strIngredient4: 'Garlic', strMeasure4: '3 cloves',
          strIngredient5: '', strMeasure5: ''
        }]
      })
    })));
    const r = (await fetchWebRecipe('52772'))!;
    expect(r.id).toBe('web-52772');
    expect(r.ingredients).toEqual([
      { name: 'poulet', qty: 500, unit: 'g' },
      { name: 'sauce soja', qty: 180, unit: 'ml' },
      { name: 'oeufs', qty: 2, unit: 'pièce' },
      { name: 'ail' }
    ]);
    expect(r.steps).toEqual(['Preheat oven.', 'Mix everything.']);
    expect(r.tags).toEqual(['chicken', 'japanese']);
  });

  it('idées depuis le stock : classées par nombre d’ingrédients en commun', async () => {
    const data: Record<string, { idMeal: string; strMeal: string }[]> = {
      chicken: [{ idMeal: '1', strMeal: 'A' }, { idMeal: '2', strMeal: 'B' }],
      rice: [{ idMeal: '2', strMeal: 'B' }]
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ meals: data[new URL(url).searchParams.get('i')!] ?? null })
    })));
    const hits = await ideasFromStock(['poulet', 'riz basmati', 'truc']);
    expect(hits.map((h) => h.name)).toEqual(['B', 'A']);
  });
});

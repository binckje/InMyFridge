import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchReliable, fetchWebRecipe, ideasFromStock, isReliable, measure, toEnglish, toFrench } from '../src/lib/web-recipes';

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

describe('measure', () => {
  it('fractions, parenthèses, unités anglaises', () => {
    expect(measure('1 1/2 cups')).toEqual({ qty: 360, unit: 'ml' });
    expect(measure('1 (400g) tin')).toEqual({ qty: 400, unit: 'g' });
    expect(measure('½ tsp')).toEqual({ qty: 0.5, unit: 'c. à café' });
    expect(measure('2 slices')).toEqual({ qty: 2, unit: 'tranche' });
    expect(measure('3 chopped')).toEqual({ qty: 3, unit: 'pièce' });
    expect(measure('to taste')).toEqual({});
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
      { name: 'ail', qty: 3, unit: 'gousse' }
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

  it('ne garde que les recettes aux ingrédients fiables', async () => {
    const meal = (id: string, ...ings: string[]) => ({
      idMeal: id,
      strMeal: `R${id}`,
      ...Object.fromEntries(ings.map((n, i) => [`strIngredient${i + 1}`, n]))
    });
    const meals: Record<string, object | null> = {
      '1': meal('1', 'Chicken', 'Rice', 'Garlic'),
      '2': meal('2', 'Chicken', 'Rice'),
      '3': meal('3', 'Chicken', 'Rice', 'Garam Masala'),
      '4': null
    };
    expect(isReliable(meal('1', 'Chicken', 'Rice', 'Garlic'))).toBe(true);
    expect(isReliable(meal('3', 'Chicken', 'Rice', 'Garam Masala'))).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = new URL(url).searchParams.get('i')!;
      if (id === '5') throw new Error('réseau');
      return { ok: true, json: async () => ({ meals: meals[id] ? [meals[id]] : null }) };
    }));
    const list = await fetchReliable(['1', '2', '3', '4', '5'].map((id) => ({ id, name: id })));
    expect(list.map((r) => r.id)).toEqual(['web-1']);
  });
});

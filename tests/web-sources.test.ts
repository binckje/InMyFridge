import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanDomain, defaultSources, fromEdamam, fromSchema, fromVideo, ideasAll, importUrl, minutes, searchAll, searchFocused, sourceLabel, type Sources } from '../src/lib/web-sources';
// @ts-expect-error fichier JavaScript du Worker, sans types
import worker, { links, recipesIn } from '../worker/worker.js';

afterEach(() => vi.unstubAllGlobals());

const SCHEMA = {
  '@type': ['Recipe'],
  name: 'Poulet basquaise &amp; riz',
  image: [{ '@type': 'ImageObject', url: 'https://img.example/p.jpg' }],
  recipeYield: ['4', '4 personnes'],
  prepTime: 'PT20M',
  cookTime: 'PT1H10M',
  recipeIngredient: ['1 poulet', '400 g de tomates', '2 poivrons', 'sel'],
  recipeInstructions: [
    { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: '<p>Faire dorer le poulet.</p>' }] },
    { '@type': 'HowToStep', text: 'Ajouter les l&eacute;gumes.' }
  ],
  video: { embedUrl: 'https://www.youtube.com/embed/abc' }
};

describe('schema.org → recette', () => {
  it('convertit ingrédients, temps, étapes, image', () => {
    const r = fromSchema(SCHEMA, 'https://www.cuisineaz.com/recettes/poulet-1.aspx')!;
    expect(r.name).toBe('Poulet basquaise & riz');
    expect(r.id).toMatch(/^site-/);
    expect(r.servings).toBe(4);
    expect([r.prepTime, r.cookTime, r.time]).toEqual([20, 70, 90]);
    expect(r.ingredients.map((i) => i.name)).toEqual(['poulet', 'tomates', 'poivrons', 'sel']);
    expect(r.ingredients[1]).toMatchObject({ qty: 400, unit: 'g' });
    expect(r.steps).toEqual(['Faire dorer le poulet.', 'Ajouter les légumes.']);
    expect(r.image).toBe('https://img.example/p.jpg');
    expect(r.video).toBe('https://www.youtube.com/embed/abc');
    expect(sourceLabel(r, defaultSources())).toBe('CuisineAZ');
  });

  it('étapes en texte simple, recette sans ingrédients refusée', () => {
    expect(fromSchema({ name: 'X', recipeIngredient: ['2 oeufs'], recipeInstructions: 'Battre.\nCuire.' }, 'https://a.fr/x')!.steps).toEqual(['Battre.', 'Cuire.']);
    expect(fromSchema({ name: 'X' }, 'https://a.fr/x')).toBeNull();
    expect(minutes('PT1H30M')).toBe(90);
    expect(minutes('')).toBeUndefined();
  });
});

describe('YouTube', () => {
  it('garde la vidéo dont la description liste les ingrédients', () => {
    const r = fromVideo({
      id: 'abc',
      title: 'Gratin dauphinois facile',
      description: 'Abonne-toi !\nhttps://insta.example\n\nIngrédients :\n- 1 kg de pommes de terre\n- 50 cl de crème liquide\n- 2 gousses d\'ail\n#gratin\nPréparation :\n1. Éplucher les pommes de terre et les couper en rondelles fines.'
    })!;
    expect(r.id).toBe('yt-abc');
    expect(r.name).toBe('Gratin dauphinois facile');
    expect(r.ingredients.map((i) => i.name)).toEqual(['pommes de terre', 'crème liquide', 'ail']);
    expect(r.steps).toHaveLength(1);
    expect(r.video).toBe('https://www.youtube.com/watch?v=abc');
    expect(sourceLabel(r, defaultSources())).toBe('YouTube');
  });

  it('ignore la vidéo sans liste d’ingrédients', () => {
    expect(fromVideo({ id: 'x', title: 'Vlog', description: 'Ma journée\n2 amis à la maison' })).toBeNull();
  });
});

describe('Edamam', () => {
  it('traduit les ingrédients, refuse la recette intraduisible', () => {
    const r = fromEdamam({
      id: 'e1',
      name: 'Chicken rice',
      servings: 4,
      ingredients: [
        { food: 'boneless skinless chicken breasts', quantity: 500, measure: 'gram' },
        { food: 'basmati rice', quantity: 1.5, measure: 'cup' },
        { food: 'garlic', quantity: 2, measure: 'clove' },
        { food: 'salt', quantity: 0, measure: null }
      ]
    })!;
    expect(r.ingredients).toEqual([
      { name: 'poulet', qty: 500, unit: 'g' },
      { name: 'riz', qty: 360, unit: 'ml' },
      { name: 'ail', qty: 2, unit: 'gousse' },
      { name: 'sel' }
    ]);
    expect(fromEdamam({ id: 'e2', name: 'X', ingredients: [{ food: 'chicken' }, { food: 'rice' }, { food: 'dragon fruit powder' }] })).toBeNull();
  });
});

describe('réglages', () => {
  it('nettoie un domaine', () => {
    expect(cleanDomain('https://www.Marmiton.org/recettes?x=1')).toBe('marmiton.org');
    expect(cleanDomain('pas un site')).toBe('');
  });
});

const sources = (over: Partial<Sources> = {}): Sources => ({ ...defaultSources(), worker: 'https://w.example', mealdb: false, ...over });

describe('recherche unifiée', () => {
  it('interroge les sources activées et signale celles en échec', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url);
      asked.push(`${u.pathname}?${u.searchParams.get('site') ?? ''}`);
      if (u.pathname === '/youtube') return { ok: false, status: 502, json: async () => ({ error: 'quota dépassé' }) };
      if (u.searchParams.get('site') === 'elle.fr') return { ok: true, json: async () => ({ results: [] }) };
      return { ok: true, json: async () => ({ results: [{ url: 'https://www.cuisineaz.com/r1', recipe: SCHEMA }, { url: 'https://www.cuisineaz.com/r1', recipe: SCHEMA }] }) };
    }));
    const s = sources({ youtube: true });
    s.sites.push({ name: 'Éteint', domain: 'off.fr', on: false });
    const { recipes, errors } = await searchAll('poulet', s);
    expect(asked.sort()).toEqual(['/search?cuisineaz.com', '/search?elle.fr', '/youtube?']);
    expect(recipes).toHaveLength(1);
    expect(errors).toEqual(['YouTube : quota dépassé']);
  });

  it('sans Worker : erreur explicite par source', async () => {
    const { errors } = await searchAll('poulet', sources({ worker: '', sites: [defaultSources().sites[0]] }));
    expect(errors[0]).toMatch(/^CuisineAZ : Adresse du Worker/);
  });

  it('idées : produits génériques du stock, hors sel', async () => {
    const qs: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      qs.push(new URL(url).searchParams.get('q')!);
      return { ok: true, json: async () => ({ results: [], items: [] }) };
    }));
    const { picked } = await ideasAll(['sel', 'Blanc de poulet fermier', 'truc'], sources({ sites: [defaultSources().sites[0]], edamam: true }), () => 0);
    expect(picked).toEqual(['poulet']);
    expect(qs.sort()).toEqual(['chicken', 'poulet']);
  });

  it('recherche orientée : produit du stock + mots-clés, recettes sans le produit écartées', async () => {
    const qs: string[] = [];
    const without = { ...SCHEMA, name: 'Sans', recipeIngredient: ['200 g de riz', '1 oignon'] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      qs.push(new URL(url).searchParams.get('q')!);
      return { ok: true, json: async () => ({ results: [{ url: 'https://www.cuisineaz.com/a', recipe: { ...SCHEMA, recipeIngredient: ['2 blancs de poulet', '1 oignon'] } }, { url: 'https://www.cuisineaz.com/b', recipe: without }], items: [] }) };
    }));
    const { recipes } = await searchFocused('Blanc de poulet fermier', ['curry'], sources({ sites: [defaultSources().sites[0]], edamam: true }));
    expect(qs.sort()).toEqual(['chicken curry', 'poulet curry']);
    expect(recipes.map((r) => r.url)).toEqual(['https://www.cuisineaz.com/a']);
  });

  it('import par lien', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ url: 'https://www.elle.fr/r', recipe: SCHEMA }) })));
    expect((await importUrl(' https://www.elle.fr/r ', sources())).ingredients).toHaveLength(4);
  });
});

describe('Worker', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Tarte","recipeIngredient":["3 pommes"]}]}</script>
    <script type="application/ld+json">{ cassé </script></head>
    <body><a href="/recettes/tarte-aux-pommes-123456.aspx">Tarte aux <b>pommes</b></a>
    <a href="/recettes/recherche_terme.aspx?recherche=x">Recherche</a>
    <a href="https://autre.fr/recettes/tarte-999999">Ailleurs</a>
    <a href="/img/tarte-aux-pommes.jpg">photo</a></body></html>`;
  const call = (path: string, origin?: string, env = {}) =>
    worker.fetch(new Request(`https://w.example${path}`, origin ? { headers: { Origin: origin } } : {}), env);

  it('extrait les recettes JSON-LD et les liens de recettes', () => {
    expect(recipesIn(html).map((r: { name: string }) => r.name)).toEqual(['Tarte']);
    expect(links(html, new URL('https://www.cuisineaz.com/recherche?q=pommes'), 'cuisineaz.com', ['pommes'])).toEqual([
      'https://www.cuisineaz.com/recettes/tarte-aux-pommes-123456.aspx'
    ]);
  });

  it('état, origine, adresses refusées', async () => {
    expect(await (await call('/', undefined, { YOUTUBE_KEY: 'k' })).json()).toEqual({ ok: true, youtube: true, edamam: false });
    expect((await call('/recipe?url=https://a.fr/x', 'https://pirate.example')).status).toBe(403);
    expect((await call('/recipe?url=https://a.fr/x')).status).toBe(403);
    expect((await call('/recipe?url=http://127.0.0.1/x', 'http://localhost:5173')).status).toBe(400);
    expect((await call('/youtube?q=x', 'https://binckje.github.io')).status).toBe(400);
  });

  it('recherche sur un site puis lecture des pages', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, text: async () => html };
    }));
    const res = await call(`/search?site=cuisineaz.com&q=pommes&tpl=${encodeURIComponent('https://www.cuisineaz.com/recherche?q={q}')}`, 'https://binckje.github.io');
    const data = await res.json();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://binckje.github.io');
    expect(data.via).toBe('site');
    expect(data.results).toHaveLength(1);
    expect(data.results[0].recipe.name).toBe('Tarte');
    expect(fetched).toEqual(['https://www.cuisineaz.com/recherche?q=pommes', 'https://www.cuisineaz.com/recettes/tarte-aux-pommes-123456.aspx']);
  });
});

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { docxText, findServings, findTime, findTimes, parseRecipeJson, parseRecipeText, rtfText } from '../src/lib/recipe-import';

const TARTE = `Tarte aux pommes

Pour 6 personnes
Préparation : 20 min
Cuisson : 35 min

Ingrédients :
- 1 pâte brisée
- 4 pommes
- 50 g de sucre
- 30 g beurre

Préparation
1. Préchauffer le four à 180 °C.
2. Éplucher les pommes et les couper en lamelles.
3. Disposer sur la pâte, saupoudrer de sucre, parsemer de beurre.
4. Cuire 35 minutes.`;

describe('parseRecipeText', () => {
  it('sections, personnes, temps', () => {
    const r = parseRecipeText(TARTE);
    expect(r.name).toBe('Tarte aux pommes');
    expect(r.servings).toBe(6);
    expect(r.time).toBe(55);
    expect(r.ingredients.map((i) => i.name)).toEqual(['pâte brisée', 'pommes', 'sucre', 'beurre']);
    expect(r.ingredients[2]).toEqual({ name: 'sucre', qty: 50, unit: 'g' });
    expect(r.steps).toHaveLength(4);
    expect(r.steps[0]).toBe('Préchauffer le four à 180 °C.');
  });

  it('sans titres de sections : devine ingrédients et étapes', () => {
    const r = parseRecipeText(`Omelette\n3 oeufs\n20 g beurre\nsel\nBattre les oeufs avec le sel.\nCuire dans le beurre fondu.`);
    expect(r.ingredients.map((i) => i.name)).toEqual(['oeufs', 'beurre', 'sel']);
    expect(r.steps).toEqual(['Battre les oeufs avec le sel.', 'Cuire dans le beurre fondu.']);
  });

  it('personnes et temps', () => {
    expect(findServings('Recette pour 4 à 6 personnes')).toBe(4);
    expect(findServings('Portions : 8')).toBe(8);
    expect(findTime('Temps total : 1 h 15')).toBe(75);
    expect(findTime('Préparation : 15 min · Cuisson : 1 h')).toBe(75);
    expect(findTimes('Préparation : 15 min · Cuisson : 1 h')).toEqual({ prepTime: 15, cookTime: 60 });
    expect(findTimes('Temps total : 30 min')).toEqual({ prepTime: undefined, cookTime: undefined });
  });
});

describe('formats', () => {
  it('docx', async () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:r><w:t>Crêpes</w:t></w:r></w:p>
      <w:p><w:r><w:t>Ingrédients</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">250 g farine &amp; </w:t></w:r><w:r><w:t>sucre</w:t></w:r></w:p>
    </w:body></w:document>`;
    const zip = zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<x/>') });
    const text = await docxText(zip);
    expect(text.split('\n').map((l) => l.trim()).filter(Boolean)).toEqual(['Crêpes', 'Ingrédients', '250 g farine & sucre']);
  });

  it('rtf', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}
{\*\generator Test;}\f0\fs24 Cr\'eapes\par
Ingr\'e9dients\par
\bullet  250 g farine\par
Fa\u238?tes chauffer\par}`;
    expect(rtfText(rtf).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)).toEqual([
      'Crêpes',
      'Ingrédients',
      '• 250 g farine',
      'Faîtes chauffer'
    ]);
  });

  it('json exporté par l’app', () => {
    const list = parseRecipeJson(JSON.stringify({ recipes: [{ name: 'X', ingredients: [{ name: 'ail' }], source: 'base' }] }));
    expect(list).toEqual([{ name: 'X', emoji: undefined, servings: 4, time: undefined, tags: [], ingredients: [{ name: 'ail' }], steps: [], rating: undefined, url: undefined, image: undefined, source: 'perso' }]);
  });
});

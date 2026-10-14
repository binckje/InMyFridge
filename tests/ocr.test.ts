import { describe, expect, it } from 'vitest';
import { suggest } from '../src/lib/ocr';

describe('suggest', () => {
  it('texte le plus gros d’abord, contenance détectée, bruit ignoré', () => {
    const r = suggest([
      { text: 'Cuisson 10 minutes', size: 20, confidence: 90 },
      { text: 'RIZ BASMATI', size: 60, confidence: 92 },
      { text: '~~ |', size: 80, confidence: 30 },
      { text: 'Poids net : 1,5 kg', size: 18, confidence: 88 },
      { text: 'riz basmati', size: 20, confidence: 90 }
    ]);
    expect(r.names).toEqual(['Riz basmati', 'Cuisson 10 minutes', 'Poids net 1,5 kg']);
    expect(r.qty).toBe('1,5 kg');
  });
});

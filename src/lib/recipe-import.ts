import { parseIngredient } from './recipes';
import type { Recipe } from './types';

/* ---------- Extraction du texte selon le format ---------- */

export const IMPORT_ACCEPT = '.txt,.md,.rtf,.docx,.pdf,.json,text/plain,application/pdf,application/rtf,application/json';

/** Texte brut d'un fichier recette : txt, md, rtf, docx, pdf. */
export async function fileText(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx') return docxText(new Uint8Array(await file.arrayBuffer()));
  if (ext === 'pdf') return pdfText(await file.arrayBuffer());
  const text = await file.text();
  if (ext === 'rtf' || text.startsWith('{\\rtf')) return rtfText(text);
  return text;
}

/** Word : paragraphes de word/document.xml. */
export async function docxText(data: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const doc = unzipSync(data, { filter: (f) => f.name === 'word/document.xml' })['word/document.xml'];
  if (!doc) throw new Error('Document Word illisible.');
  const xml = strFromU8(doc);
  return xml
    .split(/<\/w:p>/)
    .map((p) =>
      p
        .replace(/<w:tab\/>/g, ' ')
        .replace(/<w:br\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
    )
    .map(decodeXml)
    .join('\n');
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&');

/** RTF : retire les groupes de mise en forme et les mots de contrôle, garde accents et paragraphes. */
export function rtfText(rtf: string): string {
  let out = '';
  let depth = 0;
  const skip: number[] = []; // profondeurs des groupes ignorés (polices, couleurs, styles…)
  let uc = 1;
  let pendingSkip = 0;
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === '{') {
      depth++;
      continue;
    }
    if (c === '}') {
      if (skip.at(-1) === depth) skip.pop();
      depth--;
      continue;
    }
    const ignoring = skip.length > 0;
    if (c === '\\') {
      const next = rtf[i + 1];
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4);
        i += 3;
        if (pendingSkip) pendingSkip--;
        else if (!ignoring) out += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex, 16)]));
        continue;
      }
      if (next === '\\' || next === '{' || next === '}') {
        if (!ignoring) out += next;
        i++;
        continue;
      }
      if (next === '*') {
        skip.push(depth);
        i++;
        continue;
      }
      const m = rtf.slice(i + 1).match(/^([a-z]+)(-?\d+)? ?/i);
      if (!m) continue;
      i += m[0].length;
      const [, word, arg] = m;
      if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable', 'listoverridetable'].includes(word))
        skip.push(depth);
      else if (ignoring) continue;
      else if (word === 'par' || word === 'line' || word === 'row') out += '\n';
      else if (word === 'tab' || word === 'cell') out += ' ';
      else if (word === 'uc') uc = +(arg ?? 1);
      else if (word === 'u') {
        out += String.fromCharCode(((+arg! % 65536) + 65536) % 65536);
        pendingSkip = uc;
      } else if (word === 'emdash') out += '—';
      else if (word === 'endash') out += '–';
      else if (word === 'bullet') out += '•';
      else if (word === 'lquote' || word === 'rquote') out += '’';
      else if (word === 'ldblquote') out += '«';
      else if (word === 'rdblquote') out += '»';
      continue;
    }
    if (ignoring || c === '\r' || c === '\n') continue;
    if (pendingSkip) {
      pendingSkip--;
      continue;
    }
    out += c;
  }
  return out;
}

/** PDF : texte de chaque page (PDF scanné sans texte → erreur, utiliser la photo). */
export async function pdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
  }
  const text = pages.join('\n');
  if (!text.trim()) throw new Error('Ce PDF ne contient pas de texte (scan) : utilise plutôt « Photo ».');
  return text;
}

/* ---------- Texte → fiche recette normalisée ---------- */

const ING_HEAD = /^(ingr[ée]dients?|il (vous )?faut|liste des courses)\b/i;
const STEP_HEAD = /^(pr[ée]paration|[ée]tapes?|instructions?|recette|m[ée]thode|d[ée]roul[ée]|r[ée]alisation|cuisson)\b/i;
const OTHER_HEAD = /^(astuces?|conseils?|notes?|remarques?|variantes?|ustensiles?|mat[ée]riel)\b/i;
const BULLET = /^\s*(?:[-–—•*·▪●○◦]|\d+\s*[.)]|[a-z]\))\s+/i;
const STEP_NUM = /^\s*(?:[ée]tape\s*)?\d+\s*[.):-]\s*/i;

/** Nombre de personnes : « pour 4 personnes », « 6 pers. », « Portions : 4 ». */
export function findServings(text: string): number | undefined {
  const m =
    text.match(/pour\s+(\d+)\s*(?:à\s*\d+\s*)?(?:personnes?|pers\b|parts?|convives?)/i) ??
    text.match(/(\d+)\s*(?:personnes?|pers\.?\b|parts\b|portions\b)/i) ??
    text.match(/(?:portions?|parts?|personnes?|couverts?)\s*:?\s*(\d+)/i);
  const n = m ? +m[1] : NaN;
  return n > 0 && n < 50 ? n : undefined;
}

/** Temps total en minutes : somme des « préparation : 20 min », « cuisson : 1 h 15 »… */
export function findTime(text: string): number | undefined {
  const toMin = (h?: string, m?: string) => (+(h ?? 0) * 60) + +(m ?? 0);
  const total = text.match(/temps\s+total\s*:?\s*(?:(\d+)\s*h\s*(\d+)?|(\d+)\s*min)/i);
  if (total) return total[3] ? +total[3] : toMin(total[1], total[2]);
  let sum = 0;
  for (const m of text.matchAll(/(?:pr[ée]paration|cuisson|repos)\s*:?\s*(?:(\d+)\s*h(?:eures?)?\s*(\d+)?|(\d+)\s*min)/gi))
    sum += m[3] ? +m[3] : toMin(m[1], m[2]);
  return sum || undefined;
}

/** Temps de préparation, de cuisson et de repos séparés, en minutes. */
export function findTimes(text: string): { prepTime?: number; cookTime?: number; restTime?: number } {
  const one = (label: string) => {
    const m = text.match(new RegExp(`${label}\\s*:?\\s*(?:(\\d+)\\s*h(?:eures?)?\\s*(\\d+)?|(\\d+)\\s*min)`, 'i'));
    return m ? (m[3] ? +m[3] : +m[1] * 60 + +(m[2] ?? 0)) || undefined : undefined;
  };
  return { prepTime: one('pr[ée]paration'), cookTime: one('cuisson'), restTime: one('repos') };
}

/** Ressemble à un ingrédient : ligne courte sans ponctuation finale (« 3 oeufs », « sel »). */
const looksLikeIngredient = (l: string) =>
  l.length <= 60 && !/[.!?]$/.test(l) && (/^\d/.test(l) || l.split(' ').length <= 4);

/**
 * Découpe un texte de recette en fiche normalisée (nom, personnes, temps, ingrédients, étapes).
 * Gère les titres de sections (« Ingrédients », « Préparation »…) et, à défaut,
 * devine : lignes courtes avec quantité = ingrédients, phrases = étapes.
 */
export function parseRecipeText(raw: string): Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> {
  const lines = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const name = (lines.find((l) => !ING_HEAD.test(l) && !STEP_HEAD.test(l)) ?? 'Recette importée').replace(/^#+\s*/, '');
  const servings = findServings(raw) ?? 4;
  const time = findTime(raw);

  const ingredients: string[] = [];
  const steps: string[] = [];
  let section: 'intro' | 'ing' | 'steps' | 'other' = 'intro';
  const hasHeads = lines.some((l) => ING_HEAD.test(l.replace(/^#+\s*/, '')));

  for (const line of lines.slice(lines.indexOf(name) + 1)) {
    const l = line.replace(/^#+\s*/, '');
    const head = l.replace(/[:：]\s*$/, '');
    if (ING_HEAD.test(head) && head.length < 40) {
      section = 'ing';
      const rest = l.replace(/^[^:]*:\s*/, '');
      if (rest && rest !== l) ingredients.push(...rest.split(/[,;]\s*/));
      continue;
    }
    if (STEP_HEAD.test(head) && head.length < 40 && !/\d+\s*(min|h)/i.test(head)) {
      section = 'steps';
      continue;
    }
    if (OTHER_HEAD.test(head) && head.length < 40) {
      section = 'other';
      continue;
    }
    if (findServings(l) && l.length < 40) continue;
    if (/^(temps|pr[ée]paration|cuisson|repos)\s*:?\s*\d/i.test(l)) continue;

    if (section === 'intro' && !hasHeads && !(BULLET.test(l) && !STEP_NUM.test(l)) && !looksLikeIngredient(l)) section = 'steps';
    if (section === 'ing' || (!hasHeads && section === 'intro')) {
      // dans la section ingrédients, une vraie phrase numérotée annonce les étapes
      if (section === 'ing' && STEP_NUM.test(l) && l.length > 60) {
        section = 'steps';
        steps.push(l.replace(STEP_NUM, ''));
        continue;
      }
      ingredients.push(l.replace(BULLET, ''));
    } else if (section === 'steps' || (section === 'intro' && !hasHeads)) {
      steps.push(l.replace(STEP_NUM, '').replace(BULLET, ''));
    }
  }

  return {
    name: name.slice(0, 80),
    emoji: '📄',
    servings,
    time,
    ...findTimes(raw),
    tags: [],
    ingredients: ingredients.map((i) => i.trim()).filter(Boolean).map(parseIngredient),
    steps: steps.filter((s) => s.length > 2),
    source: 'perso'
  };
}

/** Fichier JSON exporté par l'app (une recette ou une liste). */
export function parseRecipeJson(text: string): Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>[] {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : Array.isArray(data?.recipes) ? data.recipes : [data];
  return list
    .filter((r: Partial<Recipe>) => r && typeof r.name === 'string' && Array.isArray(r.ingredients))
    .map((r: Recipe) => ({
      name: r.name,
      emoji: r.emoji,
      servings: r.servings || 4,
      time: r.time,
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      restTime: r.restTime,
      tags: r.tags ?? [],
      ingredients: r.ingredients,
      steps: r.steps ?? [],
      rating: r.rating,
      url: r.url,
      image: r.image,
      video: r.video,
      source: r.source === 'base' ? 'perso' : (r.source ?? 'perso')
    }));
}

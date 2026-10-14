import { formatIngredient } from './recipes';
import type { Recipe } from './types';

export type ExportFormat = 'txt' | 'md' | 'docx' | 'pdf' | 'json';

export const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', hint: 'à imprimer ou partager' },
  { id: 'docx', label: 'Word', hint: '.docx, modifiable' },
  { id: 'txt', label: 'Texte', hint: '.txt, lisible partout' },
  { id: 'md', label: 'Markdown', hint: '.md, notes' },
  { id: 'json', label: 'JSON', hint: 'réimportable tel quel' }
];

/** Fiche normalisée : mêmes rubriques, même ordre, quel que soit le format. */
interface Sheet {
  title: string;
  meta: string;
  ingredients: string[];
  steps: string[];
  source?: string;
}

function sheet(r: Recipe): Sheet {
  const meta = [
    `${r.servings} personne${r.servings > 1 ? 's' : ''}`,
    r.time ? `${r.time} min` : '',
    r.rating ? `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}` : '',
    r.tags?.length ? r.tags.join(', ') : ''
  ].filter(Boolean);
  return {
    title: r.name,
    meta: meta.join(' · '),
    ingredients: r.ingredients.map((i) => formatIngredient(i) + (i.optional ? ' (facultatif)' : '')),
    steps: r.steps,
    source: r.url
  };
}

export function toText(recipes: Recipe[]): string {
  return recipes
    .map(sheet)
    .map((s) =>
      [
        s.title.toUpperCase(),
        s.meta,
        '',
        'INGRÉDIENTS',
        ...s.ingredients.map((i) => `- ${i}`),
        '',
        'PRÉPARATION',
        ...s.steps.map((st, n) => `${n + 1}. ${st}`),
        ...(s.source ? ['', `Source : ${s.source}`] : [])
      ].join('\n')
    )
    .join('\n\n----------------------------------------\n\n');
}

export function toMarkdown(recipes: Recipe[]): string {
  return recipes
    .map(sheet)
    .map((s) =>
      [
        `# ${s.title}`,
        '',
        `_${s.meta}_`,
        '',
        '## Ingrédients',
        '',
        ...s.ingredients.map((i) => `- ${i}`),
        '',
        '## Préparation',
        '',
        ...s.steps.map((st, n) => `${n + 1}. ${st}`),
        ...(s.source ? ['', `[Source](${s.source})`] : [])
      ].join('\n')
    )
    .join('\n\n---\n\n');
}

export function toJson(recipes: Recipe[]): string {
  const clean = recipes.map(({ id, createdAt, updatedAt, deleted, ...r }) => r);
  return JSON.stringify({ app: 'InMyFridge', recipes: clean }, null, 2);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Word minimal : un document.xml, titres en gras, puces et étapes numérotées « à la main ». */
export async function toDocx(recipes: Recipe[]): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const p = (text: string, opts: { size?: number; bold?: boolean; italic?: boolean; pageBreak?: boolean } = {}) =>
    `<w:p>${opts.pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : ''}<w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.italic ? '<w:i/>' : ''}${
      opts.size ? `<w:sz w:val="${opts.size}"/>` : ''
    }</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const body = recipes
    .map(sheet)
    .map((s, k) =>
      [
        p(s.title, { size: 40, bold: true, pageBreak: k > 0 }),
        p(s.meta, { italic: true }),
        p('Ingrédients', { size: 28, bold: true }),
        ...s.ingredients.map((i) => p(`•  ${i}`)),
        p('Préparation', { size: 28, bold: true }),
        ...s.steps.map((st, n) => p(`${n + 1}.  ${st}`)),
        ...(s.source ? [p(`Source : ${s.source}`, { italic: true })] : [])
      ].join('')
    )
    .join('');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
    )
  });
}

/** Polices PDF standard : pas d'emoji ni de caractères hors Latin-1 étendu. */
const pdfSafe = (s: string) => s.replace(/[^\x20-\xFF’‘“”«»œŒ€–—…•★☆]/gu, '').replace(/[★]/g, '*').replace(/[☆]/g, '');

export async function toPdf(recipes: Recipe[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 18;
  const W = 210 - 2 * M;
  let y = M;
  const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', gap = 2, indent = 0) => {
    doc.setFont('helvetica', style).setFontSize(size);
    const lines: string[] = doc.splitTextToSize(pdfSafe(text), W - indent);
    for (const line of lines) {
      if (y > 297 - M) {
        doc.addPage();
        y = M;
      }
      doc.text(line, M + indent, y);
      y += size * 0.42;
    }
    y += gap;
  };
  recipes.map(sheet).forEach((s, k) => {
    if (k > 0) {
      doc.addPage();
      y = M;
    }
    write(s.title, 20, 'bold', 1);
    write(s.meta, 10, 'italic', 6);
    write('Ingrédients', 13, 'bold', 2);
    s.ingredients.forEach((i) => write(`•  ${i}`, 11, 'normal', 1, 2));
    y += 4;
    write('Préparation', 13, 'bold', 2);
    s.steps.forEach((st, n) => write(`${n + 1}.  ${st}`, 11, 'normal', 2, 2));
    if (s.source) write(`Source : ${s.source}`, 9, 'italic', 0);
  });
  return doc.output('blob');
}

const MIME: Record<ExportFormat, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf'
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'recette';

export async function exportBlob(recipes: Recipe[], format: ExportFormat): Promise<{ blob: Blob; name: string }> {
  const base = recipes.length === 1 ? slug(recipes[0].name) : `recettes-${new Date().toISOString().slice(0, 10)}`;
  const data =
    format === 'txt'
      ? toText(recipes)
      : format === 'md'
        ? toMarkdown(recipes)
        : format === 'json'
          ? toJson(recipes)
          : format === 'docx'
            ? await toDocx(recipes)
            : await toPdf(recipes);
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: MIME[format] });
  return { blob, name: `${base}.${format}` };
}

/** Partage (iPhone : « Enregistrer dans Fichiers », Mail…) ou, à défaut, téléchargement. */
export async function saveFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

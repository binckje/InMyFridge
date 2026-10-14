import { parseStock } from './stock';

/**
 * OCR d'une photo d'emballage, dans le navigateur (Tesseract.js, sans service en ligne).
 * Moteur et données « français » servis par l'app elle-même (dossier tesseract/),
 * mis en cache après la première utilisation.
 */
export interface OcrLine {
  text: string;
  /** Hauteur du texte : le nom du produit est en général écrit en gros. */
  size: number;
  confidence: number;
}

export async function readPhoto(image: Blob, onProgress?: (p: number) => void): Promise<OcrLine[]> {
  const { createWorker } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL}tesseract/`;
  const worker = await createWorker('fra', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress)
  });
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
    return (data.blocks ?? [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .map((l) => ({ text: l.text.trim(), size: l.bbox.y1 - l.bbox.y0, confidence: l.confidence }));
  } finally {
    await worker.terminate();
  }
}

/** Nettoie une ligne lue : garde lettres, chiffres et ponctuation simple. */
const clean = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}\s'’%,.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Noms possibles (texte le plus gros d'abord) et contenance trouvée (« 500 g », « 1,5 L »). */
export function suggest(lines: OcrLine[]): { names: string[]; qty?: string } {
  const seen = new Set<string>();
  const names = lines
    .filter((l) => l.confidence > 40)
    .map((l) => ({ ...l, text: clean(l.text) }))
    .filter((l) => (l.text.match(/\p{L}/gu) ?? []).length >= 3 && l.text.length <= 40)
    .sort((a, b) => b.size - a.size)
    .map((l) => l.text.toLowerCase().replace(/^./, (c) => c.toUpperCase()))
    .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, 8);
  const all = lines.map((l) => l.text).join(' ');
  const m = all.match(/(\d+(?:[.,]\d+)?)\s?(kg|g|ml|cl|l)\b/i);
  const q = m ? parseStock(`x ${m[1]} ${m[2].toLowerCase()}`) : undefined;
  return { names, qty: q?.qty != null ? `${String(q.qty).replace('.', ',')} ${q.unit}` : undefined };
}

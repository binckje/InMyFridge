import { db } from './db';
import { guessAisle } from './aisles';
import { parseStock } from './stock';
import type { Product } from './types';

/* ---------- Caméra ---------- */

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Codes EAN / UPC valides (chiffre de contrôle) : évite les lectures erronées. */
export function validCode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const d = code.padStart(13, '0').split('').map(Number);
  const sum = d.slice(0, 12).reduce((t, n, i) => t + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const Native = () =>
  (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;

async function zxingReader() {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
  const hints = new Map<number, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    // Cherche plus longtemps : codes petits ou flous.
    [DecodeHintType.TRY_HARDER, true]
  ]);
  return new BrowserMultiFormatReader(hints as Map<never, never>, { delayBetweenScanAttempts: 150 });
}

/** Réglages offerts par la caméra (selon le téléphone). */
export interface Scanner {
  stop: () => void;
  zoom?: { min: number; max: number; step: number; value: number };
  setZoom: (z: number) => void;
  torch: boolean;
  setTorch: (on: boolean) => void;
}

type Caps = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean };

/**
 * Lit les codes-barres dans le flux de la caméra arrière.
 * BarcodeDetector natif quand il existe (Android, Chrome), sinon ZXing (iPhone).
 * Haute résolution + zoom ×2 par défaut : un petit code-barres reste net en tenant
 * le téléphone plus loin (la mise au point de près échoue sur beaucoup d'appareils).
 */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Scanner> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
    },
    audio: false
  });
  const track = stream.getVideoTracks()[0];
  const caps = (track.getCapabilities?.() ?? {}) as Caps;
  const apply = (c: object) => track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] }).catch(() => {});

  let zoom: Scanner['zoom'];
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    const value = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2));
    zoom = { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1, value };
    await apply({ zoom: value });
  }

  let stopDecode: () => void;
  const NativeDetector = Native();
  if (NativeDetector) {
    video.srcObject = stream;
    await video.play();
    const detector = new NativeDetector({ formats: FORMATS });
    let running = true;
    const loop = async () => {
      if (!running) return;
      try {
        const found = await detector.detect(video);
        const code = found.map((f) => f.rawValue).find(validCode);
        if (code) onCode(code);
      } catch {
        /* image pas prête */
      }
      setTimeout(loop, 150);
    };
    loop();
    stopDecode = () => (running = false);
  } else {
    const reader = await zxingReader();
    const controls = await reader.decodeFromStream(stream, video, (result) => {
      const code = result?.getText();
      if (code && validCode(code)) onCode(code);
    });
    stopDecode = () => controls.stop();
  }

  return {
    stop: () => {
      stopDecode();
      stream.getTracks().forEach((t) => t.stop());
    },
    zoom,
    setZoom: (z) => apply({ zoom: z }),
    torch: !!caps.torch,
    setTorch: (on) => apply({ torch: on })
  };
}

/**
 * Code-barres lu sur une photo (appareil photo natif : pleine résolution et vraie mise au point,
 * bien plus fiable pour les petits codes). null si aucun code valide.
 */
export async function decodePhoto(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  // Réduit les très grandes photos (12 Mpx) : assez de détail, décodage rapide.
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const NativeDetector = Native();
  try {
    if (NativeDetector) {
      const found = await new NativeDetector({ formats: FORMATS }).detect(canvas);
      return found.map((f) => f.rawValue).find(validCode) ?? null;
    }
    const code = (await zxingReader()).decodeFromCanvas(canvas).getText();
    return validCode(code) ? code : null;
  } catch {
    return null;
  }
}

/* ---------- Fiche produit ---------- */

/** Rayon d'après les catégories Open Food Facts (« en:frozen-foods », « en:dairies »…). */
export function aisleFromCategories(tags: string[], name: string): string {
  const t = tags.join(' ');
  const rules: [RegExp, string][] = [
    [/frozen/, 'surgeles'],
    [/yogurt|desserts|fromages-blancs|compotes/, 'laiterie-dessert'],
    [/cheeses|butters|milks|creams|eggs|dairies/, 'cremerie'],
    [/meats|fishes|seafood|poultry|hams|sausages/, 'viandes-poissons'],
    [/fruits|vegetables/, 'fruits-legumes'],
    [/beverages|waters|juices|sodas|wines|beers/, 'liquides'],
    [/chocolates|biscuits|confectioneries|sweet|breakfast-cereals|jams|honeys|sugars|coffees|teas/, 'epicerie-sucree'],
    [/pastas|rices|canned|sauces|oils|condiments|flours|legumes|snacks|salty|breads|soups/, 'epicerie-salee'],
    [/household|cleaning|detergents|hygiene/, 'menager']
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? guessAisle(name);
}

const API = 'https://world.openfoodfacts.org/api/v2/product';

/** Produit connu localement, sinon Open Food Facts. null = inconnu (ou hors ligne). */
export async function lookup(code: string): Promise<Product | null> {
  const known = await db.products.get(code);
  if (known) return known;
  try {
    const res = await fetch(
      `${API}/${code}.json?fields=product_name_fr,product_name,generic_name_fr,brands,quantity,categories_tags,image_front_small_url&lc=fr`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.product;
    if (data?.status !== 1 || !p) return null;
    const name: string = (p.product_name_fr || p.product_name || p.generic_name_fr || '').trim();
    if (!name) return null;
    const q = parseStock(`x ${String(p.quantity ?? '').replace(/\s*e$/, '')}`);
    return {
      code,
      name,
      brand: String(p.brands ?? '').split(',')[0].trim() || undefined,
      qty: q.qty,
      unit: q.unit,
      aisleId: aisleFromCategories(p.categories_tags ?? [], name),
      image: p.image_front_small_url,
      updatedAt: Date.now()
    };
  } catch {
    return null;
  }
}

/** Mémorise le produit (avec les corrections de l'utilisateur) pour les prochains scans, même hors ligne. */
export const rememberProduct = (p: Omit<Product, 'updatedAt'>) => db.products.put({ ...p, updatedAt: Date.now() });

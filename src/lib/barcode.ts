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
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * Lit les codes-barres dans le flux de la caméra arrière.
 * BarcodeDetector natif quand il existe (Android, Chrome), sinon ZXing (iPhone).
 * Retourne une fonction d'arrêt.
 */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const Native = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
  if (Native) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    const detector = new Native({ formats: FORMATS });
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
    return () => {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
    };
  }
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]
  ]);
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: 'environment' }, audio: false },
    video,
    (result) => {
      const code = result?.getText();
      if (code && validCode(code)) onCode(code);
    }
  );
  return () => controls.stop();
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

import { db } from './db';

/** Format commun des images de présentation (paysage 4:3). */
export const IMG_W = 800;
export const IMG_H = 600;
/** Taille maximale d'une vidéo copiée dans l'app. */
export const MAX_VIDEO = 50 * 1024 * 1024;

/** Recadre au centre et redimensionne en 800×600, JPEG : toutes les fiches ont la même image. */
export async function resizeImage(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.max(IMG_W / bmp.width, IMG_H / bmp.height);
  const w = IMG_W / scale;
  const h = IMG_H / scale;
  const canvas = document.createElement('canvas');
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h, 0, 0, IMG_W, IMG_H);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Image d'internet : téléchargée et redimensionnée quand le site l'autorise,
 * sinon l'adresse est gardée telle quelle (l'affichage la recadre au même format).
 */
export async function imageFromUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    return await resizeImage(await res.blob());
  } catch {
    return url;
  }
}

/** Miniature : TheMealDB fournit une version réduite, les autres images servent telles quelles. */
export const thumb = (image: string) => (/themealdb\.com/.test(image) ? `${image}/preview` : image);

/* ---------- Vidéo copiée sur l'appareil (non synchronisée : trop lourde) ---------- */

export const getVideo = (recipeId: string) => db.videos.get(recipeId);
export const saveVideo = (recipeId: string, file: File) =>
  db.videos.put({ id: recipeId, blob: file, name: file.name, type: file.type });
export const deleteVideo = (recipeId: string) => db.videos.delete(recipeId);

/** Lien YouTube → adresse intégrable dans la fiche ; autre lien → undefined (ouvert à part). */
export function embedUrl(url: string): string | undefined {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : undefined;
}

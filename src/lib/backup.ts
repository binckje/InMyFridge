import { syncWith, type Snapshot } from './sync';

/** Copie complète des données locales (même format que le fichier de synchro). */
export async function exportData(): Promise<Snapshot> {
  let out: Snapshot | null = null;
  await syncWith({ read: async () => null, write: async (s) => void (out = s) });
  return out!;
}

/** Télécharge la sauvegarde : inmyfridge-AAAA-MM-JJ.json. */
export async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await exportData())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inmyfridge-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Restaure une sauvegarde en la fusionnant avec les données locales
 * (pour chaque élément, la version la plus récente gagne). Retourne le nombre d'éléments repris.
 */
export async function importBackup(text: string): Promise<number> {
  const data = JSON.parse(text) as Snapshot;
  if (data?.version !== 1 || !Array.isArray(data.stock)) throw new Error('Fichier non reconnu.');
  const { received } = await syncWith({ read: async () => data, write: async () => {} });
  return received;
}

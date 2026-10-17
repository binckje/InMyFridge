import { driveProvider, getState, hasToken, isConfigured, setState } from './drive';
import { syncWith } from './sync';
import { markSaved } from './safety';

/**
 * Synchro silencieuse quand c'est possible sans action de l'utilisateur :
 * fichier déjà choisi et connexion Google encore valide (1 h après la dernière connexion).
 * Sinon rien : la synchro manuelle (☁️) reste disponible.
 */
let running = false;
export async function autoSync(): Promise<boolean> {
  const { fileId } = getState();
  if (running || !isConfigured() || !fileId || !hasToken() || !navigator.onLine) return false;
  running = true;
  try {
    await syncWith(driveProvider(fileId));
    setState({ lastSync: Date.now(), error: undefined });
    markSaved();
    return true;
  } catch {
    return false;
  } finally {
    running = false;
  }
}

/** Au démarrage, au retour dans l'app, en la quittant, et toutes les 5 min quand elle est affichée. */
export function startAutoSync() {
  setTimeout(autoSync, 2000);
  document.addEventListener('visibilitychange', () => autoSync());
  setInterval(() => document.visibilityState === 'visible' && autoSync(), 5 * 60_000);
}

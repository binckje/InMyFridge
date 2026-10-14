import { SyncConflict, type Snapshot, type SyncProvider } from './sync';

/**
 * Synchro Google Drive. Connexion OAuth par redirection (les popups marchent mal
 * dans une PWA installée sur iOS). Portée drive.file : l'app ne voit que les fichiers
 * qu'elle a créés ou que l'utilisateur a choisis dans le Google Picker.
 */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'inmyfridge-data.json';
const FOLDER_NAME = 'InMyFridge';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type Pending = 'sync' | 'create' | 'pick';

interface DriveState {
  token?: string;
  expires?: number;
  email?: string;
  fileId?: string;
  lastSync?: number;
  error?: string;
}

const KEY = 'imf.drive';

export function getState(): DriveState {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function setState(changes: Partial<DriveState>) {
  const next = { ...getState(), ...changes };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const isConfigured = () => !!CLIENT_ID;
export const canPick = () => !!(API_KEY && APP_ID);

export class NeedAuth extends Error {}

const redirectUri = () => location.origin + location.pathname;

/** Part vers Google ; l'action en attente reprend au retour (voir handleRedirect). */
export function signIn(pending: Pending) {
  const state = crypto.randomUUID();
  localStorage.setItem('imf.oauth', JSON.stringify({ state, pending, hash: location.hash }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state
  });
  const { email } = getState();
  if (email) params.set('login_hint', email);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** À appeler au démarrage, avant d'afficher l'app. Renvoie l'action à reprendre. */
export function handleRedirect(): Pending | null {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (!hash.has('state')) return null;
  let saved: { state: string; pending: Pending; hash: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem('imf.oauth') ?? 'null');
  } catch {
    /* ignoré */
  }
  localStorage.removeItem('imf.oauth');
  history.replaceState(null, '', location.pathname + (saved?.hash ?? ''));
  if (!saved || saved.state !== hash.get('state')) return null;

  const token = hash.get('access_token');
  if (!token) {
    setState({ error: hash.get('error') === 'access_denied' ? 'Connexion refusée.' : 'Connexion impossible.' });
    return null;
  }
  setState({ token, expires: Date.now() + Number(hash.get('expires_in') ?? 3600) * 1000, error: undefined });
  return saved.pending;
}

function token() {
  const { token, expires } = getState();
  if (!token || !expires || expires - Date.now() < 60_000) throw new NeedAuth();
  return token;
}

export const hasToken = () => {
  try {
    return !!token();
  } catch {
    return false;
  }
};

async function api(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, ...init.headers }
  });
  if (res.status === 401) {
    setState({ token: undefined });
    throw new NeedAuth();
  }
  if (!res.ok) throw new Error(`Google Drive : erreur ${res.status}`);
  return res;
}

/** Mémorise l'adresse du compte (pré-remplit la connexion suivante). */
export async function fetchEmail() {
  const res = await api(`${API}/about?fields=user(emailAddress)`);
  const { user } = await res.json();
  setState({ email: user?.emailAddress });
}

/** Cherche un fichier de données déjà accessible (créé par l'app ou choisi avant). */
export async function findFile(): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await api(`${API}/files?q=${q}&fields=files(id)&orderBy=createdTime&pageSize=1`);
  const { files } = await res.json();
  return files?.[0]?.id ?? null;
}

/** Crée le dossier « InMyFridge » et le fichier de données dedans. */
export async function createFile(): Promise<string> {
  const folder = await api(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  }).then((r) => r.json());

  const boundary = 'imf' + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: FILE_NAME, parents: [folder.id], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\nnull\r\n--${boundary}--`;
  const file = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  }).then((r) => r.json());
  return file.id;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Chargement de Google impossible (hors ligne ?)'));
    document.head.append(s);
  });
}

/** Ouvre le Google Picker pour choisir le fichier partagé par un autre membre du foyer. */
export async function pickFile(): Promise<string | null> {
  const oauthToken = token();
  await loadScript('https://apis.google.com/js/api.js');
  const w = window as any;
  await new Promise<void>((resolve) => w.gapi.load('picker', resolve));
  const g = w.google.picker;
  return new Promise((resolve) => {
    const view = new g.DocsView(g.ViewId.DOCS)
      .setMimeTypes('application/json')
      .setIncludeFolders(true)
      .setMode(g.DocsViewMode.LIST);
    new g.PickerBuilder()
      .setOAuthToken(oauthToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setLocale('fr')
      .addView(view)
      .setTitle(`Choisir ${FILE_NAME}`)
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED) resolve(data.docs?.[0]?.id ?? null);
        else if (data.action === g.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

export function driveProvider(fileId: string): SyncProvider {
  /** Numéro de version Drive du fichier lu : sert à détecter une écriture concurrente. */
  let readVersion: string | undefined;
  const version = async () =>
    (await (await api(`${API}/files/${fileId}?fields=version`)).json()).version as string | undefined;
  return {
    async read() {
      readVersion = await version();
      const res = await api(`${API}/files/${fileId}?alt=media`);
      const text = (await res.text()).trim();
      if (!text || text === 'null') return null; // fichier tout juste créé
      let data: Snapshot;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Fichier de synchro illisible : rien n’a été écrasé. Restaure une sauvegarde si besoin.');
      }
      if (data?.version !== 1)
        throw new Error('Fichier de synchro écrit par une version plus récente de l’app : mets l’app à jour.');
      return data;
    },
    async write(snapshot) {
      if ((await version()) !== readVersion) throw new SyncConflict();
      await api(`${UPLOAD}/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
    }
  };
}

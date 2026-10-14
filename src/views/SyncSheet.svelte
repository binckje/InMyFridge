<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import {
    NeedAuth,
    canPick,
    createFile,
    driveProvider,
    fetchEmail,
    findFile,
    getState,
    hasToken,
    isConfigured,
    pickFile,
    setState,
    signIn,
    type Pending
  } from '../lib/drive';
  import { syncWith } from '../lib/sync';
  import { downloadBackup, importBackup } from '../lib/backup';

  let { pending = null, onclose }: { pending?: Pending | null; onclose: () => void } = $props();

  let st = $state(getState());
  let busy = $state(false);
  let message = $state('');
  let needsFile = $state(false);

  const refresh = () => (st = getState());

  async function run(action: Pending) {
    busy = true;
    message = '';
    try {
      if (!hasToken()) return signIn(action);
      if (!getState().email) await fetchEmail().catch(() => {});

      let fileId = getState().fileId;
      if (action === 'create') fileId = await createFile();
      else if (action === 'pick') fileId = (await pickFile()) ?? undefined;
      else if (!fileId) fileId = (await findFile()) ?? undefined;

      if (!fileId) {
        needsFile = true;
        if (action === 'pick') message = 'Aucun fichier choisi.';
        return;
      }
      needsFile = false;
      setState({ fileId });
      const { received } = await syncWith(driveProvider(fileId));
      setState({ lastSync: Date.now(), error: undefined });
      message = received ? `Synchronisé · ${received} élément${received > 1 ? 's' : ''} reçu${received > 1 ? 's' : ''}` : 'Synchronisé ✓';
    } catch (e) {
      if (e instanceof NeedAuth) return signIn(action);
      message = e instanceof Error ? e.message : 'Erreur inconnue';
      if (/ 404$/.test(message)) {
        setState({ fileId: undefined });
        needsFile = true;
        message = 'Fichier introuvable : choisis-le ou crée-le à nouveau.';
      }
    } finally {
      busy = false;
      refresh();
    }
  }

  function disconnect() {
    setState({ token: undefined, expires: undefined, email: undefined, fileId: undefined, lastSync: undefined });
    needsFile = false;
    message = 'Déconnecté (données locales conservées).';
    refresh();
  }

  /* ---------- Sauvegarde locale ---------- */
  let backupMsg = $state('');
  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const n = await importBackup(await file.text());
      backupMsg = n ? `Restauré · ${n} élément${n > 1 ? 's' : ''} repris` : 'Rien de nouveau dans ce fichier.';
    } catch (err) {
      backupMsg = err instanceof Error && err.message === 'Fichier non reconnu.' ? err.message : 'Fichier illisible.';
    }
  }

  const when = (t?: number) =>
    t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';

  $effect(() => {
    if (pending) run(pending);
  });
</script>

<button class="backdrop" aria-label="Fermer" onclick={onclose} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 300, duration: 200 }}>
  <h2>☁️ Synchro Google Drive</h2>

  {#if !isConfigured()}
    <p class="muted">Synchro non configurée : identifiant Google absent de cette version.</p>
  {:else}
    <p class="muted">
      {#if st.email}Compte : <strong>{st.email}</strong><br />{/if}
      Dernière synchro : {when(st.lastSync)}
    </p>
    {#if st.error}<p class="err">{st.error}</p>{/if}

    {#if needsFile}
      <p>Aucun fichier de données trouvé pour ce compte.</p>
      <button class="btn" disabled={busy} onclick={() => run('create')}>Créer le dossier « InMyFridge »</button>
      {#if canPick()}
        <button class="btn ghost" disabled={busy} onclick={() => run('pick')}>Choisir le fichier partagé</button>
      {/if}
      <p class="hint">
        Premier appareil du foyer : crée le dossier, puis partage-le (droit « Éditeur ») depuis Google Drive.
        Autre membre : choisis le fichier <code>inmyfridge-data.json</code> partagé avec toi.
      </p>
    {:else}
      <button class="btn" disabled={busy} onclick={() => run('sync')}>
        {busy ? 'Synchronisation…' : 'Synchroniser maintenant'}
      </button>
    {/if}

    {#if message}<p class="msg">{message}</p>{/if}

    <div class="actions">
      {#if st.email || st.fileId}
        <button class="btn danger" onclick={disconnect}>Se déconnecter</button>
      {/if}
      <button class="btn ghost" onclick={onclose}>Fermer</button>
    </div>
  {/if}

  <h3>💾 Sauvegarde</h3>
  <p class="hint">Copie de toutes les données dans un fichier, à garder au cas où. La restauration fusionne : rien n'est effacé.</p>
  <div class="backup">
    <button class="btn ghost" onclick={downloadBackup}>Télécharger</button>
    <label class="btn ghost">Restaurer…<input type="file" accept="application/json,.json" onchange={restore} hidden /></label>
  </div>
  {#if backupMsg}<p class="msg">{backupMsg}</p>{/if}
  {#if !isConfigured()}
    <button class="btn ghost" onclick={onclose}>Fermer</button>
  {/if}
</div>

<style>
  h2 { margin: 0; font-size: 20px; }
  p { margin: 0; }
  .muted, .hint { color: var(--muted); font-size: 15px; }
  .hint { font-size: 13px; }
  .err { color: var(--danger); }
  .msg { text-align: center; font-weight: 600; }
  .btn:disabled { opacity: 0.6; }
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 50;
  }
  .actions { display: flex; justify-content: space-between; }
  h3 { margin: 8px 0 0; font-size: 16px; }
  .backup { display: flex; gap: 8px; }
  .backup .btn { flex: 1; text-align: center; }
  .actions .btn.ghost:only-child { margin-left: auto; }
</style>

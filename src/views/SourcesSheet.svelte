<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cleanDomain, defaultSources, getSources, saveSources, workerStatus, type Sources } from '../lib/web-sources';

  /** Réglages des sources de recettes internet (propres à cet appareil). */
  let { onclose }: { onclose: () => void } = $props();

  let s = $state<Sources>(getSources());
  // Enregistrement immédiat de chaque changement
  $effect(() => saveSources($state.snapshot(s) as Sources));

  /* ---------- Worker ---------- */
  let status = $state<{ ok: boolean; youtube: boolean; edamam: boolean } | null>(null);
  let testing = $state(false);
  let testError = $state('');

  async function test() {
    testing = true;
    testError = '';
    status = null;
    try {
      status = await workerStatus(s.worker);
    } catch (e) {
      testError = e instanceof Error && e.message.length < 140 ? e.message : 'Worker injoignable : vérifie son adresse.';
    } finally {
      testing = false;
    }
  }
  if (s.worker) test();

  /* ---------- Sites ---------- */
  let name = $state('');
  let domain = $state('');
  let search = $state('');
  let siteError = $state('');

  function addSite() {
    siteError = '';
    const d = cleanDomain(domain);
    if (!d) return (siteError = 'Adresse du site invalide (exemple : marmiton.org).');
    if (s.sites.some((x) => x.domain === d)) return (siteError = 'Ce site est déjà dans la liste.');
    const tpl = search.trim();
    if (tpl && (!tpl.includes('{q}') || !cleanDomain(tpl).endsWith(d)))
      return (siteError = 'Adresse de recherche : elle doit être sur ce site et contenir {q} à la place du mot cherché.');
    s.sites.push({ name: name.trim() || d, domain: d, search: tpl || undefined, on: true });
    name = domain = search = '';
  }

  function removeSite(i: number) {
    if (confirm(`Retirer « ${s.sites[i].name} » des sources ?`)) s.sites.splice(i, 1);
  }

  function reset() {
    if (confirm('Remettre la liste de sites par défaut ?')) s.sites = defaultSources().sites;
  }
</script>

<button class="backdrop" aria-label="Fermer" onclick={onclose} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 400, duration: 200 }} role="dialog" aria-label="Sources internet">
  <h2>⚙️ Sources de recettes internet</h2>

  <section>
    <h3>Worker Cloudflare</h3>
    <p class="hint">Relais nécessaire aux sites, à YouTube et à Edamam. Les clés API y sont enregistrées, pas dans l'app.</p>
    <div class="row">
      <input bind:value={s.worker} placeholder="https://inmyfridge.ton-compte.workers.dev" inputmode="url" autocapitalize="off" autocomplete="off" aria-label="Adresse du Worker" />
      <button class="btn ghost" onclick={test} disabled={testing || !s.worker.trim()}>{testing ? '…' : 'Tester'}</button>
    </div>
    {#if testError}<p class="err">{testError}</p>{/if}
    {#if status}
      <p class="hint">✅ Worker joignable · YouTube : {status.youtube ? 'clé présente' : 'clé absente'} · Edamam : {status.edamam ? 'clés présentes' : 'clés absentes'}</p>
    {/if}
  </section>

  <section>
    <h3>Sources</h3>
    <label class="toggle"><input type="checkbox" bind:checked={s.mealdb} /> <span>TheMealDB <small>en anglais, sans Worker</small></span></label>
    <label class="toggle"><input type="checkbox" bind:checked={s.youtube} /> <span>YouTube <small>vidéos dont la description liste les ingrédients · environ 100 recherches par jour</small></span></label>
    <label class="toggle"><input type="checkbox" bind:checked={s.edamam} /> <span>Edamam <small>en anglais, ingrédients traduits</small></span></label>
  </section>

  <section>
    <h3>Sites de recettes</h3>
    {#each s.sites as site, i (site.domain)}
      <div class="site">
        <label class="toggle"><input type="checkbox" bind:checked={site.on} /> <span>{site.name} <small>{site.domain}{site.search ? '' : ' · recherche via DuckDuckGo'}</small></span></label>
        <button class="link danger" onclick={() => removeSite(i)} aria-label="Retirer {site.name}">🗑️</button>
      </div>
    {/each}
    {#if !s.sites.length}<p class="hint">Aucun site.</p>{/if}

    <div class="add">
      <input bind:value={name} placeholder="Nom (Marmiton)" autocomplete="off" aria-label="Nom du site" />
      <input bind:value={domain} placeholder="Site (marmiton.org)" inputmode="url" autocapitalize="off" autocomplete="off" aria-label="Adresse du site" />
      <input bind:value={search} placeholder={'Adresse de recherche avec {q} (facultatif)'} inputmode="url" autocapitalize="off" autocomplete="off" aria-label="Adresse de recherche" />
      <button class="btn ghost" onclick={addSite} disabled={!domain.trim()}>＋ Ajouter ce site</button>
    </div>
    {#if siteError}<p class="err">{siteError}</p>{/if}
    <p class="hint">
      Adresse de recherche : fais une recherche sur le site, copie l'adresse de la page de résultats et remplace le mot cherché par <code>{'{q}'}</code>. Sans elle, la recherche passe par DuckDuckGo.
    </p>
    <button class="link" onclick={reset}>Remettre les sites par défaut</button>
  </section>

  <button class="btn" onclick={onclose}>Terminé</button>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 70; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 640px;
    max-height: 90dvh;
    overflow-y: auto;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 80;
  }
  h2 { margin: 0; font-size: 18px; }
  h3 { margin: 0; font-size: 15px; }
  section { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; gap: 8px; }
  .row input { flex: 1; min-width: 0; }
  .row .btn { flex: none; }
  .toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .toggle input { flex: none; width: 22px; height: 22px; padding: 0; accent-color: var(--green); }
  .toggle span { display: flex; flex-direction: column; min-width: 0; }
  small { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  .site { display: flex; align-items: center; gap: 8px; }
  .add { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .hint { margin: 0; font-size: 13px; color: var(--muted); }
  .err { margin: 0; color: var(--danger); }
  .link { align-self: flex-start; padding: 4px 0; color: var(--green); background: none; }
  .link.danger { align-self: center; flex: none; padding: 8px; }
  .btn:disabled { opacity: 0.5; }
  code { font-size: 13px; }
</style>

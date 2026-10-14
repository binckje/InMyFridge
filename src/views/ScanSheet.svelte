<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { lookup, rememberProduct, startScanner, validCode } from '../lib/barcode';
  import { AISLES } from '../lib/aisles';
  import { LOCATIONS, guessLocation } from '../lib/locations.svelte';
  import { addItem } from '../lib/shopping';
  import { addStock } from '../lib/stock';
  import type { Product } from '../lib/types';

  /** Scan de code-barres → fiche produit → ajout au stock (ou à la liste de courses). */
  let {
    mode,
    locationId,
    onclose
  }: { mode: 'stock' | 'courses'; locationId?: string; onclose: () => void } = $props();

  type Step = 'scan' | 'loading' | 'product';
  let step = $state<Step>('scan');
  let video = $state<HTMLVideoElement>();
  let stop: (() => void) | undefined;
  let cameraError = $state('');
  let manual = $state('');
  let added = $state('');

  let code = $state('');
  let known = $state(false);
  let form = $state({ name: '', brand: '', image: '', qty: '', aisleId: 'autre', locationId: '', count: 1 });

  async function camera() {
    cameraError = '';
    if (!video) return;
    try {
      stop = await startScanner(video, found);
    } catch (e) {
      const name = (e as Error).name;
      cameraError =
        name === 'NotAllowedError'
          ? "Accès à la caméra refusé. Autorise-le dans les réglages du navigateur, ou tape le code à la main."
          : !window.isSecureContext
            ? 'La caméra nécessite une connexion sécurisée (https). Tape le code à la main.'
            : "Caméra indisponible. Tape le code à la main.";
    }
  }

  $effect(() => {
    if (step === 'scan' && video) camera();
    return () => {
      stop?.();
      stop = undefined;
    };
  });
  onDestroy(() => stop?.());

  async function found(c: string) {
    if (step !== 'scan') return;
    navigator.vibrate?.(30);
    code = c;
    step = 'loading';
    const p = await lookup(c);
    known = !!p;
    const qty = p?.qty != null ? `${String(p.qty).replace('.', ',')}${p.unit && p.unit !== 'pièce' ? ' ' + p.unit : ''}` : '';
    form = {
      name: p?.name ?? '',
      brand: p?.brand ?? '',
      image: p?.image ?? '',
      qty,
      aisleId: p?.aisleId ?? 'autre',
      locationId: locationId ?? p?.locationId ?? guessLocation(p?.aisleId ?? 'autre'),
      count: 1
    };
    step = 'product';
  }

  function submitManual(e: SubmitEvent) {
    e.preventDefault();
    const c = manual.replace(/\D/g, '');
    if (c) found(c);
  }

  /** Quantité totale : contenance × nombre d'exemplaires (« 500 g » × 2 → « 1000 g »). */
  function total(): string {
    const m = form.qty.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m) return form.count > 1 ? `x${form.count}` : form.qty.trim();
    const n = +m[1].replace(',', '.') * form.count;
    return `${String(Math.round(n * 1000) / 1000).replace('.', ',')} ${m[2]}`.trim();
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const parsedQty = form.qty.trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l)?$/i);
    await rememberProduct({
      code,
      name,
      brand: form.brand || undefined,
      qty: parsedQty ? +parsedQty[1].replace(',', '.') : undefined,
      unit: parsedQty ? ((parsedQty[2]?.toLowerCase() as Product['unit']) ?? 'pièce') : undefined,
      aisleId: form.aisleId,
      locationId: form.locationId,
      image: form.image || undefined
    });
    if (mode === 'stock') await addStock(`${name} ${total()}`, form.locationId, undefined, form.aisleId);
    else await addItem(name, form.count > 1 ? `x${form.count}` : '', form.aisleId);
    navigator.vibrate?.(12);
    added = name;
    setTimeout(() => (added = ''), 2500);
    manual = '';
    step = 'scan';
  }

  const valid = $derived(validCode(manual.replace(/\D/g, '')));
</script>

<button class="backdrop" aria-label="Fermer" onclick={onclose} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 500, duration: 220 }} role="dialog" aria-label="Scanner un code-barres">
  <div class="head">
    <h2>{mode === 'stock' ? '📷 Scanner pour ranger' : '📷 Scanner pour la liste'}</h2>
    <button class="close" onclick={onclose} aria-label="Fermer">✕</button>
  </div>

  {#if step === 'scan'}
    <div class="viewer">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} playsinline muted></video>
      <div class="aim"></div>
      {#if added}<div class="ok" transition:fade>✅ {added} ajouté — scanne le suivant</div>{/if}
    </div>
    {#if cameraError}<p class="err">{cameraError}</p>{:else}<p class="hint">Vise le code-barres, il est lu tout seul.</p>{/if}
    <form class="manual" onsubmit={submitManual}>
      <input bind:value={manual} inputmode="numeric" placeholder="ou tape le code : 3017620422003" aria-label="Code-barres" autocomplete="off" />
      <button class="btn" type="submit" disabled={!manual.trim()}>OK</button>
    </form>
    {#if manual.trim() && !valid}<p class="hint">Code EAN de 8 ou 13 chiffres.</p>{/if}
  {:else if step === 'loading'}
    <p class="loading">🔎 Recherche du produit {code}…</p>
  {:else}
    <form class="product" onsubmit={add}>
      <div class="card">
        {#if form.image}<img src={form.image} alt="" />{:else}<span class="ph">📦</span>{/if}
        <div>
          {#if known}
            <p class="found">{form.brand ? form.brand + ' · ' : ''}code {code}</p>
          {:else}
            <p class="unknown">Produit inconnu (code {code}). Donne-lui un nom, il sera reconnu la prochaine fois.</p>
          {/if}
        </div>
      </div>
      <input bind:value={form.name} placeholder="Nom du produit" aria-label="Nom du produit" />
      <div class="row">
        <label>
          <span class="lbl">Contenance</span>
          <input bind:value={form.qty} placeholder="ex. 500 g" aria-label="Contenance" />
        </label>
        <div class="count">
          <span class="lbl">Nombre</span>
          <div class="stepper">
            <button type="button" onclick={() => (form.count = Math.max(1, form.count - 1))} aria-label="Moins">−</button>
            <span>{form.count}</span>
            <button type="button" onclick={() => form.count++} aria-label="Plus">+</button>
          </div>
        </div>
      </div>
      {#if mode === 'stock'}
        <div class="field">
          <span class="lbl">Emplacement</span>
          <div class="chips">
            {#each LOCATIONS as l (l.id)}
              <button type="button" class="chip" class:sel={form.locationId === l.id} onclick={() => (form.locationId = l.id)}>{l.emoji} {l.label}</button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="field">
          <span class="lbl">Rayon</span>
          <div class="chips">
            {#each AISLES as a (a.id)}
              <button type="button" class="chip" class:sel={form.aisleId === a.id} onclick={() => (form.aisleId = a.id)}>{a.emoji} {a.label}</button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="actions">
        <button type="button" class="btn ghost" onclick={() => (step = 'scan')}>Annuler</button>
        <button type="submit" class="btn" disabled={!form.name.trim()}>
          {mode === 'stock' ? `Ranger ${total() || ''}` : 'Ajouter à la liste'}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 640px;
    max-height: 94vh;
    overflow-y: auto;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 50;
  }
  .head { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 20px; }
  .close { font-size: 20px; padding: 4px 8px; color: var(--muted); }

  .viewer { position: relative; aspect-ratio: 4 / 3; border-radius: var(--radius); overflow: hidden; background: #000; }
  video { width: 100%; height: 100%; object-fit: cover; }
  .aim {
    position: absolute;
    inset: 30% 12%;
    border: 3px solid rgb(255 255 255 / 0.85);
    border-radius: 12px;
    box-shadow: 0 0 0 999px rgb(0 0 0 / 0.25);
  }
  .ok {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--green);
    color: #fff;
    font-weight: 600;
    text-align: center;
  }
  .hint { margin: 0; color: var(--muted); font-size: 14px; }
  .err { margin: 0; color: var(--danger); font-size: 15px; }
  .manual { display: flex; gap: 8px; }
  .manual .btn { flex: none; }
  .btn:disabled { opacity: 0.4; }
  .loading { text-align: center; padding: 40px 0; color: var(--muted); }

  .product { display: flex; flex-direction: column; gap: 12px; }
  .card { display: flex; gap: 12px; align-items: center; }
  .card img { width: 64px; height: 64px; object-fit: contain; border-radius: 10px; background: #fff; }
  .ph { font-size: 44px; }
  .found { margin: 0; color: var(--muted); font-size: 14px; }
  .unknown { margin: 0; color: var(--amber); font-size: 14px; }
  .row { display: flex; gap: 12px; align-items: flex-end; }
  label, .field, .count { display: flex; flex-direction: column; gap: 6px; }
  label { flex: 1; }
  .lbl { font-size: 13px; color: var(--muted); }
  .stepper { display: flex; align-items: center; gap: 4px; height: 48px; }
  .stepper button { width: 40px; height: 40px; border-radius: 50%; background: var(--green-soft); font-size: 20px; }
  .stepper span { min-width: 28px; text-align: center; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 6px 12px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); font-size: 15px; }
  .chip.sel { background: var(--green); border-color: var(--green); color: #fff; }
  .actions { display: flex; justify-content: space-between; gap: 8px; }
</style>

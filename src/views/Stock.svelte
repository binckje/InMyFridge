<script lang="ts">
  import { liveQuery } from 'dexie';
  import { fly, fade, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { db } from '../lib/db';
  import { LOCATIONS, categoryOf, locationById } from '../lib/locations.svelte';
  import { isLow } from '../lib/shopping';
  import {
    UNITS, addStock, detectKind, type QtyKind, adjust, deleteStock, formatPacks, formatQty, parseStock, splitPacks, updateStock, withQty
  } from '../lib/stock';
  import { LEVELS, type Level, type StockItem, type Unit } from '../lib/types';
  import ScanSheet from './ScanSheet.svelte';
  import LocationsSheet from './LocationsSheet.svelte';

  let configuring = $state(false);

  let scanning = $state(false);

  const items = liveQuery(() => db.stock.filter((s) => !s.deleted).toArray());
  const all = $derived(($items ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')));

  /* ---------- Filtres ---------- */
  type Filter = 'tout' | 'bas' | string;
  let filter = $state<Filter>('tout');
  let text = $state('');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const low = $derived(all.filter(isLow));
  const shown = $derived(
    all.filter(
      (s) =>
        (filter === 'tout' || (filter === 'bas' ? isLow(s) : s.locationId === filter)) &&
        (!text.trim() || norm(s.name).includes(norm(parseStock(text.trim()).name)))
    )
  );
  const count = (locId: string) => all.filter((s) => s.locationId === locId).length;

  /** Regroupement : par sous-catégorie dans un emplacement, sinon par emplacement. */
  const groups = $derived.by(() => {
    const loc = LOCATIONS.find((l) => l.id === filter);
    if (loc?.categories?.length) {
      return loc.categories
        .map((c) => ({
          key: c.id,
          title: `${c.emoji} ${c.label}`,
          items: shown.filter((s) => categoryOf(loc, s.categoryId)?.id === c.id)
        }))
        .filter((g) => g.items.length);
    }
    return LOCATIONS.map((l) => ({
      key: l.id,
      title: `${l.emoji} ${l.label}`,
      items: shown.filter((s) => locationById(s.locationId).id === l.id)
    })).filter((g) => g.items.length);
  });

  /* ---------- Ajout rapide ---------- */
  const target = $derived(LOCATIONS.find((l) => l.id === filter));
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const input = text;
    const k = qtyKind;
    text = '';
    kind = null;
    const added = await addStock(input, target?.id, k);
    if (!added) return;
    buzz();
    flash = added.id;
    setTimeout(() => (flash = null), 1200);
  }
  let flash = $state<string | null>(null);

  /** Type de quantité : deviné depuis le texte, modifiable via les puces. */
  let kind = $state<QtyKind | null>(null);
  $effect(() => {
    if (!text.trim()) kind = null;
  });
  const qtyKind = $derived(kind ?? detectKind(text));
  const KINDS: { id: QtyKind; label: string }[] = [
    { id: 'pièce', label: '🔢 Nombre' },
    { id: 'level', label: '📊 Niveau' },
    { id: 'g', label: 'g' },
    { id: 'kg', label: 'kg' },
    { id: 'ml', label: 'ml' },
    { id: 'cl', label: 'cl' },
    { id: 'l', label: 'l' }
  ];

  /* ---------- Édition ---------- */
  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  let editing = $state<StockItem | null>(null);
  let form = $state({
    name: '',
    locationId: '',
    categoryId: '',
    mode: 'qty' as 'qty' | 'level',
    qty: '',
    unit: 'pièce' as Unit,
    level: 'suffisamment' as Level,
    thresholdQty: '',
    thresholdLevel: '' as Level | '',
    usePacks: false,
    packName: '',
    packSize: '',
    /** Lots saisis à la main ; null = découpés automatiquement depuis quantité / contenance. */
    packs: null as number[] | null,
    thresholdIn: 'qty' as 'qty' | 'packs',
    thresholdPacks: '',
    addSize: ''
  });
  const canPack = $derived(form.mode === 'qty' && form.unit !== 'pièce');
  const formPacks = $derived(form.packs ?? splitPacks(num(form.qty) ?? 0, num(form.packSize) ?? num(form.qty) ?? 0));
  const formPackName = $derived(form.packName.trim() || 'lot');
  const fmt = (n: number) => String(n).replace('.', ',');
  function addFormPack() {
    const size = num(form.addSize) ?? num(form.packSize);
    if (!size) return;
    form.packs = [...formPacks, size].sort((a, b) => a - b);
    form.packSize = fmt(size);
  }
  const removeFormPack = (i: number) => (form.packs = formPacks.filter((_, j) => j !== i));
  const formLoc = $derived(locationById(form.locationId));

  function edit(s: StockItem) {
    editing = s;
    form = {
      name: s.name,
      locationId: locationById(s.locationId).id,
      categoryId: categoryOf(locationById(s.locationId), s.categoryId)?.id ?? 'autre',
      mode: s.level ? 'level' : 'qty',
      qty: s.qty == null ? '' : String(s.qty).replace('.', ','),
      unit: s.unit ?? 'pièce',
      level: s.level ?? 'suffisamment',
      thresholdQty: s.thresholdQty == null ? '' : String(s.thresholdQty).replace('.', ','),
      thresholdLevel: s.thresholdLevel ?? '',
      usePacks: !!s.packs,
      packName: s.packName ?? '',
      packSize: s.packSize == null ? '' : fmt(s.packSize),
      packs: s.packs ? [...s.packs] : null,
      thresholdIn: s.thresholdPacks != null ? 'packs' : 'qty',
      thresholdPacks: s.thresholdPacks == null ? '' : String(s.thresholdPacks),
      addSize: ''
    };
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!editing || !form.name.trim()) return;
    const qtyMode = form.mode === 'qty';
    const packed = canPack && form.usePacks;
    const packs = packed ? formPacks : undefined;
    const byPacks = packed && form.thresholdIn === 'packs';
    await updateStock(editing.id, {
      name: form.name.trim(),
      locationId: form.locationId,
      categoryId: formLoc.categories?.length ? form.categoryId : undefined,
      qty: packs ? packs.reduce((a, b) => a + b, 0) : qtyMode ? (num(form.qty) ?? 0) : undefined,
      unit: qtyMode ? form.unit : undefined,
      level: qtyMode ? undefined : form.level,
      packs,
      packName: packed ? form.packName.trim() || undefined : undefined,
      packSize: packed ? (num(form.packSize) ?? packs?.[packs.length - 1]) : undefined,
      thresholdPacks: byPacks ? num(form.thresholdPacks) : undefined,
      thresholdQty: qtyMode && !byPacks ? num(form.thresholdQty) : undefined,
      thresholdLevel: qtyMode ? undefined : form.thresholdLevel || undefined
    });
    editing = null;
  }

  /* ---------- Suppression avec annulation ---------- */
  let undo = $state<{ id: string; name: string } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout>;
  async function remove(s: StockItem) {
    editing = null;
    await deleteStock(s.id);
    undo = { id: s.id, name: s.name };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (undo = null), 4000);
  }
  async function restore() {
    if (undo) await updateStock(undo.id, { deleted: false });
    undo = null;
  }

  function step(s: StockItem, dir: 1 | -1) {
    buzz();
    adjust(s, dir);
  }
  // Saisie directe de la quantité (tap sur le nombre) : plus rapide que +/- pour un gros écart.
  let typing = $state<string | null>(null);
  let typed = $state('');
  function startTyping(s: StockItem) {
    typing = s.id;
    typed = s.qty == null ? '' : String(s.qty).replace('.', ',');
  }
  async function commitTyped(s: StockItem) {
    if (typing !== s.id) return;
    typing = null;
    const n = num(typed);
    if (n != null && n >= 0 && n !== s.qty) await updateStock(s.id, withQty(s, n));
  }
  const focus = (el: HTMLInputElement) => el.select();

  const atMin = (s: StockItem) => (s.level ? s.level === LEVELS[0] : !s.qty);
  const atMax = (s: StockItem) => s.level === LEVELS[LEVELS.length - 1];

  const buzz = () => navigator.vibrate?.(12);
</script>

<header>
  <h1>Stock</h1>
  <p class="sub">
    {#if all.length === 0}
      Rien d'enregistré pour l'instant.
    {:else}
      <strong>{all.length}</strong> produit{all.length > 1 ? 's' : ''}{#if low.length}{' · '}<span
          class="warn">{low.length} à racheter</span
        >{/if}
    {/if}
  </p>
</header>

<div class="locs">
  <button class="chip" class:sel={filter === 'tout'} onclick={() => (filter = 'tout')}>Tout</button>
  {#if low.length}
    <button class="chip low" class:sel={filter === 'bas'} onclick={() => (filter = 'bas')}
      >⚠️ Bas {low.length}</button
    >
  {/if}
  {#each LOCATIONS as l (l.id)}
    <button class="chip" class:sel={filter === l.id} onclick={() => (filter = l.id)}>
      {l.emoji} {l.label}{#if count(l.id)}<span class="n">{count(l.id)}</span>{/if}
    </button>
  {/each}
  <button class="chip gear" onclick={() => (configuring = true)} aria-label="Configurer les emplacements">⚙️</button>
</div>

<form class="add" onsubmit={submit}>
  <input
    bind:value={text}
    placeholder={target ? `${target.emoji} Ajouter… ex. « lait 2 l »` : 'Chercher ou ajouter… ex. « lait 2 l »'}
    enterkeyhint="done"
    autocomplete="off"
    aria-label="Chercher ou ajouter un produit"
  />
  {#if text.trim()}
    <button class="btn" type="submit" aria-label="Ajouter">＋</button>
  {:else}
    <button class="btn ghost" type="button" aria-label="Scanner un code-barres" onclick={() => (scanning = true)}>📷</button>
  {/if}
</form>

{#if text.trim()}
  <div class="kinds" transition:slide={{ duration: 150 }}>
    {#each KINDS as k (k.id)}
      <button type="button" class="chip" class:sel={qtyKind === k.id} onclick={() => (kind = k.id)}>{k.label}</button>
    {/each}
  </div>
  <p class="hint kind-hint">
    {#if qtyKind === 'level'}Ajouté au niveau « suffisamment ».{:else}Quantité : tape le nombre dans le texte (sinon 1).{/if}
  </p>
{/if}

{#if all.length === 0}
  <div class="empty" in:fade>
    <div class="big">🧊</div>
    <p>Ajoute ce que tu as à la maison.<br />Choisis un emplacement, tape « beurre » ou « riz 1 kg ».</p>
    <p class="hint">Sans quantité, le produit est suivi par niveau : plus beaucoup · moyen · suffisamment.</p>
  </div>
{:else if shown.length === 0}
  <div class="empty" in:fade>
    {#if text.trim()}
      <p>Aucun « {text.trim()} » ici.<br />Appuie sur ＋ pour l'ajouter.</p>
    {:else}
      <p>Rien dans cet emplacement.</p>
    {/if}
  </div>
{/if}

{#each groups as g (g.key)}
  <section transition:slide={{ duration: 200 }}>
    <h2>{g.title} <span>{g.items.length}</span></h2>
    <ul>
      {#each g.items as s (s.id)}
        <li animate:flip={{ duration: 200 }} out:fly={{ x: 60, duration: 200 }} class:flash={flash === s.id}>
          <button class="label" onclick={() => edit(s)}>
            <span class="name">{s.name}</span>
            {#if isLow(s)}<span class="tag">bas</span>{/if}
          </button>
          <div class="stepper">
            <button onclick={() => step(s, -1)} disabled={atMin(s)} aria-label="Moins de {s.name}">−</button>
            {#if s.level}
              <span class="qty lvl" data-level={s.level}>{formatQty(s)}</span>
            {:else if typing === s.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="qty qty-input"
                bind:value={typed}
                inputmode="decimal"
                autofocus
                use:focus
                aria-label="Quantité de {s.name}"
                onblur={() => commitTyped(s)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  else if (e.key === 'Escape') typing = null;
                }}
              />
            {:else}
              <button class="qty" onclick={() => startTyping(s)} aria-label="Modifier la quantité de {s.name}"
                >{formatQty(s)}{#if s.packs}<small>{formatPacks(s)}</small>{/if}</button
              >
            {/if}
            <button onclick={() => step(s, 1)} disabled={atMax(s)} aria-label="Plus de {s.name}">+</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/each}

{#if undo}
  <div class="toast" transition:fly={{ y: 40 }}>
    « {undo.name} » supprimé <button onclick={restore}>Annuler</button>
  </div>
{/if}

{#if configuring}
  <LocationsSheet onclose={() => (configuring = false)} />
{/if}

{#if scanning}
  <ScanSheet mode="stock" locationId={target?.id} onclose={() => (scanning = false)} />
{/if}

{#if editing}
  <button class="backdrop" aria-label="Fermer" onclick={() => (editing = null)} transition:fade={{ duration: 150 }}></button>
  <form class="sheet" onsubmit={save} transition:fly={{ y: 400, duration: 200 }}>
    <input bind:value={form.name} placeholder="Produit" aria-label="Nom" />

    <div class="field">
      <span class="lbl">Emplacement</span>
      <div class="chips">
        {#each LOCATIONS as l (l.id)}
          <button type="button" class="chip" class:sel={form.locationId === l.id} onclick={() => (form.locationId = l.id)}
            >{l.emoji} {l.label}</button
          >
        {/each}
      </div>
    </div>

    {#if formLoc.categories?.length}
      <div class="field">
        <span class="lbl">Catégorie</span>
        <div class="chips">
          {#each formLoc.categories as c (c.id)}
            <button type="button" class="chip" class:sel={form.categoryId === c.id} onclick={() => (form.categoryId = c.id)}
              >{c.emoji} {c.label}</button
            >
          {/each}
        </div>
      </div>
    {/if}

    <div class="field">
      <div class="seg">
        <button type="button" class:sel={form.mode === 'qty'} onclick={() => (form.mode = 'qty')}>Quantité</button>
        <button type="button" class:sel={form.mode === 'level'} onclick={() => (form.mode = 'level')}>Niveau</button>
      </div>
    </div>

    {#if form.mode === 'qty'}
      <div class="row">
        {#if canPack && form.usePacks}
          <span class="total">{fmt(formPacks.reduce((a, b) => a + b, 0))}</span>
        {:else}
          <input bind:value={form.qty} inputmode="decimal" placeholder="Quantité" aria-label="Quantité" />
        {/if}
        <select bind:value={form.unit} aria-label="Unité">
          {#each UNITS as u}<option value={u}>{u}</option>{/each}
        </select>
      </div>
      {#if canPack}
        <label class="check"><input type="checkbox" bind:checked={form.usePacks} /> Par lots (plaquette, bouteille…)</label>
        {#if form.usePacks}
          <div class="row">
            <input bind:value={form.packName} placeholder="Nom (plaquette…)" aria-label="Nom d'un lot" />
            <input bind:value={form.packSize} inputmode="decimal" placeholder="Contenance" aria-label="Contenance d'un lot" />
            <span class="u">{form.unit}</span>
          </div>
          <div class="chips">
            {#each formPacks as p, i (i)}
              <button type="button" class="chip" onclick={() => removeFormPack(i)} aria-label="Retirer ce lot">{fmt(p)} {form.unit} ✕</button>
            {/each}
          </div>
          <div class="row">
            <input bind:value={form.addSize} inputmode="decimal" placeholder={form.packSize || 'Contenance'} aria-label="Contenance du lot à ajouter" />
            <span class="u">{form.unit}</span>
            <button type="button" class="btn" onclick={addFormPack}>+ 1 {formPackName}</button>
          </div>
        {/if}
      {/if}
      <div class="field">
        <span class="lbl">Seuil d'alerte (ajout aux courses quand ≤)</span>
        <div class="row">
          {#if canPack && form.usePacks && form.thresholdIn === 'packs'}
            <input bind:value={form.thresholdPacks} inputmode="numeric" placeholder="Aucun" aria-label="Seuil en lots" />
          {:else}
            <input bind:value={form.thresholdQty} inputmode="decimal" placeholder="Aucun" aria-label="Seuil" />
          {/if}
          {#if canPack && form.usePacks}
            <div class="seg">
              <button type="button" class:sel={form.thresholdIn === 'qty'} onclick={() => (form.thresholdIn = 'qty')}>{form.unit}</button>
              <button type="button" class:sel={form.thresholdIn === 'packs'} onclick={() => (form.thresholdIn = 'packs')}
                >{formPackName}s</button
              >
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="chips">
        {#each LEVELS as l}
          <button type="button" class="chip" class:sel={form.level === l} onclick={() => (form.level = l)}>{l}</button>
        {/each}
      </div>
      <div class="field">
        <span class="lbl">Seuil d'alerte (ajout aux courses quand ≤)</span>
        <div class="chips">
          <button type="button" class="chip" class:sel={!form.thresholdLevel} onclick={() => (form.thresholdLevel = '')}
            >aucun</button
          >
          {#each LEVELS.slice(0, 2) as l}
            <button type="button" class="chip" class:sel={form.thresholdLevel === l} onclick={() => (form.thresholdLevel = l)}
              >{l}</button
            >
          {/each}
        </div>
      </div>
    {/if}

    <div class="actions">
      <button type="button" class="btn danger" onclick={() => editing && remove(editing)}>Supprimer</button>
      <button type="submit" class="btn">Enregistrer</button>
    </div>
  </form>
{/if}

<style>
  h1 { margin: 8px 0 0; font-size: 32px; }
  .sub { margin: 2px 0 10px; color: var(--muted); }
  .warn { color: var(--amber); font-weight: 600; }

  .locs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin: 0 -16px;
    padding: 0 16px 4px;
    scrollbar-width: none;
  }
  .locs::-webkit-scrollbar { display: none; }
  .locs .chip { flex: none; white-space: nowrap; }
  .n { margin-left: 6px; opacity: 0.7; font-size: 13px; }
  .chip.low:not(.sel) { border-color: var(--amber); color: var(--amber); }

  .add {
    position: sticky;
    top: env(safe-area-inset-top);
    z-index: 5;
    display: flex;
    gap: 8px;
    padding: 12px 0 8px;
    background: var(--bg);
  }
  .add .btn { width: 48px; flex: none; padding: 0; font-size: 22px; }
  .add .btn:disabled { opacity: 0.4; }

  .kinds { display: flex; flex-wrap: wrap; gap: 6px; }
  .kinds .chip { padding: 5px 11px; font-size: 14px; }
  .kind-hint { margin: 6px 0 0; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--card);
    border: 1px solid var(--line);
    font-size: 15px;
  }
  .chip.sel { background: var(--green); border-color: var(--green); color: #fff; }

  section { margin-top: 18px; }
  h2 {
    margin: 0 0 6px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  h2 span { font-weight: 400; }
  ul { list-style: none; margin: 0; padding: 0; border-radius: var(--radius); background: var(--card); overflow: hidden; }
  li {
    display: flex;
    align-items: center;
    min-height: 52px;
    border-bottom: 1px solid var(--line);
    transition: background 0.6s;
  }
  li:last-child { border-bottom: 0; }
  li.flash { background: var(--green-soft); }

  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 8px 14px 14px;
    text-align: left;
  }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag {
    flex: none;
    padding: 1px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--amber) 20%, transparent);
    color: var(--amber);
    font-size: 12px;
    font-weight: 600;
  }

  .stepper { flex: none; display: flex; align-items: center; padding-right: 8px; }
  .stepper button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 22px;
    line-height: 1;
    color: var(--green);
    transition: transform 0.15s, background 0.15s;
  }
  .stepper button:active { transform: scale(0.85); background: var(--green-soft); }
  .stepper button:disabled { color: var(--line); }
  .qty { min-width: 64px; text-align: center; color: var(--muted); font-size: 15px; }
  .stepper button.qty { width: auto; height: auto; border-radius: 8px; font-size: 15px; color: var(--muted); padding: 4px 2px; }
  .qty-input { width: 64px; border: 1px solid var(--green); border-radius: 8px; padding: 4px; font: inherit; background: transparent; color: var(--text, inherit); }
  .qty.lvl { font-size: 13px; line-height: 1.1; }
  .qty[data-level='plus beaucoup'] { color: var(--danger); }
  .qty[data-level='moyen'] { color: var(--amber); }
  .qty[data-level='suffisamment'] { color: var(--green); }

  .empty { text-align: center; color: var(--muted); padding: 48px 16px; }
  .big { font-size: 64px; }
  .hint { font-size: 14px; }

  .toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(var(--tabbar) + env(safe-area-inset-bottom) + 12px);
    max-width: 608px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-radius: 12px;
    background: #292524;
    color: #fff;
    z-index: 20;
  }
  .toast button { color: #86efac; font-weight: 700; }

  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 640px;
    max-height: 90vh;
    overflow-y: auto;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 50;
  }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .lbl { font-size: 13px; color: var(--muted); }
  .row { display: flex; gap: 8px; }
  .row select { width: 110px; flex: none; }
  .row .u { align-self: center; color: var(--muted); flex: none; }
  .row .btn { flex: none; }
  .row .seg { flex: none; }
  .total { flex: 1; align-self: center; font-size: 18px; font-weight: 600; padding-left: 4px; }
  .check { display: flex; align-items: center; gap: 8px; color: var(--muted); }
  .qty small { display: block; font-size: 11px; line-height: 1.1; }
  .seg { display: flex; padding: 3px; border-radius: 12px; background: var(--line); }
  .seg button { flex: 1; padding: 8px; border-radius: 10px; color: var(--muted); }
  .seg button.sel { background: var(--card); color: var(--text); font-weight: 600; }
  .actions { display: flex; justify-content: space-between; }
</style>

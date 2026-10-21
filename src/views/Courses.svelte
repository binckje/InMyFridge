<script lang="ts">
  import { liveQuery } from 'dexie';
  import { fly, fade, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { db, type Memory } from '../lib/db';
  import { AISLES, aisleById } from '../lib/aisles';
  import {
    addItem,
    deleteItem,
    isGroupOut,
    isOut,
    suggestions,
    syncLowStock,
    toggleItem,
    updateItem,
    parseShopping
  } from '../lib/shopping';
  import { formatQty } from '../lib/stock';
  import type { ShoppingItem } from '../lib/types';
  import RestockSheet from './RestockSheet.svelte';
  import ScanSheet from './ScanSheet.svelte';

  let scanning = $state(false);

  const items = liveQuery(() => db.shopping.filter((i) => !i.deleted).toArray());
  const stock = liveQuery(() => db.stock.filter((s) => !s.deleted).toArray());
  const stockGroups = liveQuery(() => db.groups.filter((g) => !g.deleted).toArray());
  /** Seuil atteint : « inexistant » si plus rien en stock, sinon « stock bas ». */
  const lowTag = (item: ShoppingItem) => {
    const all = $stock ?? [];
    if (item.groupId) {
      const g = ($stockGroups ?? []).find((g) => g.id === item.groupId);
      return g && isGroupOut(g, all) ? 'inexistant' : 'stock bas';
    }
    const s = all.find((s) => s.id === item.stockItemId);
    return s && isOut(s) ? 'inexistant' : 'stock bas';
  };
  /** Détail d'un groupe ajouté aux courses : ce qu'il en reste en stock, produit par produit. */
  const inGroup = (groupId: string) =>
    ($stock ?? [])
      .filter((s) => s.groupId === groupId)
      .map((s) => `${s.name} ${formatQty(s)}`.trim())
      .join(', ') || 'plus rien';

  const todo = $derived(($items ?? []).filter((i) => !i.checked));
  const done = $derived(($items ?? []).filter((i) => i.checked));
  const total = $derived(todo.length + done.length);
  const groups = $derived(
    AISLES.map((a) => ({
      aisle: a,
      items: todo.filter((i) => aisleById(i.aisleId).id === a.id).sort((x, y) => x.createdAt - y.createdAt)
    })).filter((g) => g.items.length)
  );

  // Ajout automatique des produits sous le seuil à l'ouverture de l'écran.
  syncLowStock();

  /* ---------- Saisie rapide ---------- */
  let text = $state('');
  let focused = $state(false);
  let sugg = $state<Memory[]>([]);
  $effect(() => {
    const t = text;
    void $items; // rafraîchit quand la liste change
    suggestions(t).then((s) => (sugg = s));
  });


  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const { name, qty } = parseShopping(text.trim());
    if (!name) return;
    await addItem(name, qty);
    buzz();
    text = '';
  }

  async function pick(m: Memory) {
    await addItem(m.name, '', m.aisleId);
    buzz();
    text = '';
  }

  /* ---------- Cocher ---------- */
  let celebrate = $state(false);
  async function check(item: ShoppingItem) {
    buzz();
    const last = !item.checked && todo.length === 1;
    await toggleItem(item);
    if (last) {
      celebrate = true;
      setTimeout(() => (celebrate = false), 2500);
    }
  }

  /* ---------- Édition ---------- */
  let editing = $state<ShoppingItem | null>(null);
  let form = $state({ name: '', qty: '', aisleId: '' });
  function edit(item: ShoppingItem) {
    editing = item;
    form = { name: item.name, qty: item.qty ?? '', aisleId: aisleById(item.aisleId).id };
  }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!editing || !form.name.trim()) return;
    await updateItem(editing.id, {
      name: form.name.trim(),
      qty: form.qty.trim() || undefined,
      aisleId: form.aisleId
    });
    editing = null;
  }

  /* ---------- Suppression avec annulation ---------- */
  let undo = $state<{ id: string; name: string } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout>;
  async function remove(item: ShoppingItem) {
    editing = null;
    await deleteItem(item.id);
    undo = { id: item.id, name: item.name };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (undo = null), 4000);
  }
  async function restore() {
    if (undo) await updateItem(undo.id, { deleted: false });
    undo = null;
  }

  /* ---------- Fin des courses : ranger dans le stock ---------- */
  let restock = $state(false);
  let stored = $state(0);
  function restocked(n?: number) {
    restock = false;
    if (!n) return;
    stored = n;
    setTimeout(() => (stored = 0), 3000);
  }

  const buzz = () => navigator.vibrate?.(12);
</script>

<header>
  <h1>Courses</h1>
  <p class="sub">
    {#if total === 0}
      Rien à acheter pour l'instant.
    {:else if todo.length === 0}
      Tout est dans le panier 🎉
    {:else}
      <strong>{todo.length}</strong> à prendre{#if done.length}{" · "}{done.length} dans le panier{/if}
    {/if}
  </p>
  {#if total > 0}
    <div class="progress"><div style="width: {(done.length / total) * 100}%"></div></div>
  {/if}
</header>

<form class="add" onsubmit={submit}>
  <input
    bind:value={text}
    onfocus={() => (focused = true)}
    onblur={() => setTimeout(() => (focused = false), 150)}
    placeholder="Ajouter… ex. « 2 l lait »"
    enterkeyhint="done"
    autocomplete="off"
    aria-label="Ajouter un article"
  />
  {#if text.trim()}
    <button class="btn" type="submit" aria-label="Ajouter">＋</button>
  {:else}
    <button class="btn ghost" type="button" aria-label="Scanner un code-barres" onclick={() => (scanning = true)}>📷</button>
  {/if}
</form>

{#if (focused || text) && sugg.length}
  <div class="chips" transition:slide={{ duration: 150 }}>
    {#each sugg as m (m.key)}
      <button class="chip" onclick={() => pick(m)}>{aisleById(m.aisleId).emoji} {m.name}</button>
    {/each}
  </div>
{/if}

{#if total === 0}
  <div class="empty" in:fade>
    <div class="big">🛒</div>
    <p>Ta liste est vide.<br />Ajoute un article ci-dessus — le rayon est deviné tout seul.</p>
  </div>
{/if}

{#each groups as g (g.aisle.id)}
  <section transition:slide={{ duration: 200 }}>
    <h2>{g.aisle.emoji} {g.aisle.label} <span>{g.items.length}</span></h2>
    <ul>
      {#each g.items as item (item.id)}
        <li animate:flip={{ duration: 200 }} out:fly={{ x: 60, duration: 200 }}>
          <button class="check" onclick={() => check(item)} aria-label="Cocher {item.name}"></button>
          <button class="label" onclick={() => edit(item)}>
            <span class="name">{item.name}</span>
            {#if item.qty}<span class="qty">{item.qty}</span>{/if}
            {#if item.stockItemId || item.groupId}<span class="tag">{lowTag(item)}</span>{/if}
            {#if item.groupId}<span class="detail">en stock : {inGroup(item.groupId)}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/each}

{#if done.length}
  <section class="basket" transition:slide={{ duration: 200 }}>
    <h2>✅ Dans le panier <span>{done.length}</span></h2>
    <ul>
      {#each done as item (item.id)}
        <li animate:flip={{ duration: 200 }}>
          <button class="check on" onclick={() => check(item)} aria-label="Décocher {item.name}"
            >✓</button
          >
          <button class="label" onclick={() => edit(item)}>
            <span class="name">{item.name}</span>
            {#if item.qty}<span class="qty">{item.qty}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <button class="btn ghost clear" onclick={() => (restock = true)}>🧺 Ranger et vider le panier ({done.length})</button>
  </section>
{/if}

{#if celebrate}
  <div class="party" transition:fade>
    <div class="party-emoji">🎉</div>
    <p>Courses terminées !</p>
  </div>
{/if}

{#if undo}
  <div class="toast" transition:fly={{ y: 40 }}>
    « {undo.name} » supprimé <button onclick={restore}>Annuler</button>
  </div>
{/if}

{#if scanning}
  <ScanSheet mode="courses" onclose={() => (scanning = false)} />
{/if}

{#if restock}
  <RestockSheet items={done} onclose={restocked} />
{/if}

{#if stored}
  <div class="toast" transition:fly={{ y: 40 }}>🧊 {stored} produit{stored > 1 ? 's' : ''} rangé{stored > 1 ? 's' : ''} dans le stock</div>
{/if}

{#if editing}
  <button class="backdrop" aria-label="Fermer" onclick={() => (editing = null)} transition:fade={{ duration: 150 }}></button>
  <form class="sheet" onsubmit={save} transition:fly={{ y: 300, duration: 200 }}>
    <input bind:value={form.name} placeholder="Article" aria-label="Nom" />
    <input bind:value={form.qty} placeholder="Quantité (optionnel)" aria-label="Quantité" />
    <div class="aisles">
      {#each AISLES as a (a.id)}
        <button
          type="button"
          class="chip"
          class:sel={form.aisleId === a.id}
          onclick={() => (form.aisleId = a.id)}>{a.emoji} {a.label}</button
        >
      {/each}
    </div>
    <div class="actions">
      <button type="button" class="btn danger" onclick={() => editing && remove(editing)}>Supprimer</button>
      <button type="submit" class="btn">Enregistrer</button>
    </div>
  </form>
{/if}

<style>
  h1 { margin: 8px 0 0; font-size: 32px; }
  .sub { margin: 2px 0 10px; color: var(--muted); }
  .progress { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .progress div { height: 100%; background: var(--green); transition: width 0.4s ease; }

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

  .chips, .aisles { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
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
  li { display: flex; align-items: center; min-height: 52px; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }

  .check {
    flex: none;
    width: 28px;
    height: 28px;
    margin: 0 12px 0 14px;
    border-radius: 50%;
    border: 2px solid var(--green);
    color: #fff;
    font-weight: 700;
    transition: transform 0.15s, background 0.15s;
  }
  .check:active { transform: scale(0.85); }
  .check.on { background: var(--green); }
  .label {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    padding: 14px 14px 14px 0;
    text-align: left;
  }
  .qty { color: var(--muted); font-size: 15px; }
  .detail { flex-basis: 100%; color: var(--muted); font-size: 13px; }
  .tag {
    margin-left: auto;
    padding: 1px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--amber) 20%, transparent);
    color: var(--amber);
    font-size: 12px;
    font-weight: 600;
  }
  .basket .name { text-decoration: line-through; color: var(--muted); }
  .clear { display: block; margin: 12px auto 0; }

  .empty { text-align: center; color: var(--muted); padding: 48px 16px; }
  .big { font-size: 64px; }

  .party {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    pointer-events: none;
    z-index: 30;
    font-size: 22px;
    font-weight: 700;
  }
  .party-emoji { font-size: 96px; animation: pop 0.6s cubic-bezier(0.2, 1.6, 0.4, 1); }
  @keyframes pop { from { transform: scale(0) rotate(-30deg); } to { transform: scale(1) rotate(0); } }

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
</style>

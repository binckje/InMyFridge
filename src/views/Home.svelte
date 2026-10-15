<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db';
  import { addItem, parseShopping } from '../lib/shopping';
  import { addStock } from '../lib/stock';
  import ScanSheet from './ScanSheet.svelte';

  /** Accueil : accès aux onglets + ajout rapide au stock et aux courses sans changer d'onglet. */
  let { ongo }: { ongo: (tab: 'stock' | 'courses' | 'recettes') => void } = $props();

  const stockCount = liveQuery(() => db.stock.filter((s) => !s.deleted).count());
  const toBuy = liveQuery(() => db.shopping.filter((i) => !i.deleted && !i.checked).count());
  const recipeCount = liveQuery(() => db.recipes.filter((r) => !r.deleted).count());

  let stockText = $state('');
  let shopText = $state('');
  let scanning = $state<'stock' | 'courses' | null>(null);
  let done = $state<{ where: 'stock' | 'courses'; name: string } | null>(null);
  let timer: ReturnType<typeof setTimeout>;

  function confirm(where: 'stock' | 'courses', name: string) {
    navigator.vibrate?.(12);
    done = { where, name };
    clearTimeout(timer);
    timer = setTimeout(() => (done = null), 2000);
  }

  async function addToStock(e: SubmitEvent) {
    e.preventDefault();
    const input = stockText.trim();
    stockText = '';
    const added = input && (await addStock(input));
    if (added) confirm('stock', added.name);
  }

  async function addToShopping(e: SubmitEvent) {
    e.preventDefault();
    const { name, qty } = parseShopping(shopText.trim());
    shopText = '';
    if (!name) return;
    await addItem(name, qty);
    confirm('courses', name);
  }
</script>

<header>
  <h1>InMyFridge</h1>
  <p class="sub">Qu'est-ce qu'on fait ?</p>
</header>

<div class="tiles">
  <button class="tile" onclick={() => ongo('stock')}>
    <span class="icon">🧊</span><span class="lbl">Stock</span><span class="n">{$stockCount ?? 0} produit{($stockCount ?? 0) > 1 ? 's' : ''}</span>
  </button>
  <button class="tile" onclick={() => ongo('courses')}>
    <span class="icon">🛒</span><span class="lbl">Courses</span><span class="n">{$toBuy ?? 0} à acheter</span>
  </button>
  <button class="tile" onclick={() => ongo('recettes')}>
    <span class="icon">🍳</span><span class="lbl">Recettes</span><span class="n">{$recipeCount ?? 0} recette{($recipeCount ?? 0) > 1 ? 's' : ''}</span>
  </button>
</div>

<section>
  <h2>🧊 Ajouter au stock</h2>
  <form class="add" onsubmit={addToStock}>
    <input bind:value={stockText} placeholder="ex. « oeufs 6 », « lait 2 l »" enterkeyhint="done" autocomplete="off" aria-label="Ajouter au stock" />
    {#if stockText.trim()}
      <button class="btn" type="submit" aria-label="Ajouter au stock">＋</button>
    {:else}
      <button class="btn ghost" type="button" aria-label="Scanner pour le stock" onclick={() => (scanning = 'stock')}>📷</button>
    {/if}
  </form>
  {#if done?.where === 'stock'}<p class="ok">✓ {done.name} ajouté au stock</p>{/if}
</section>

<section>
  <h2>🛒 Ajouter aux courses</h2>
  <form class="add" onsubmit={addToShopping}>
    <input bind:value={shopText} placeholder="ex. « 2 l lait », « pommes »" enterkeyhint="done" autocomplete="off" aria-label="Ajouter aux courses" />
    {#if shopText.trim()}
      <button class="btn" type="submit" aria-label="Ajouter aux courses">＋</button>
    {:else}
      <button class="btn ghost" type="button" aria-label="Scanner pour les courses" onclick={() => (scanning = 'courses')}>📷</button>
    {/if}
  </form>
  {#if done?.where === 'courses'}<p class="ok">✓ {done.name} ajouté aux courses</p>{/if}
</section>

{#if scanning}
  <ScanSheet mode={scanning} onclose={() => (scanning = null)} />
{/if}

<style>
  h1 { margin: 8px 0 0; font-size: 32px; }
  .sub { margin: 2px 0 16px; color: var(--muted); }
  h2 { margin: 0 0 8px; font-size: 17px; }

  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 14px 6px;
    border-radius: var(--radius);
    background: var(--card);
    border: 1px solid var(--line);
  }
  .tile:active { transform: scale(0.97); }
  .tile .icon { font-size: 30px; }
  .tile .lbl { font-weight: 600; }
  .tile .n { font-size: 12px; color: var(--muted); }

  section { margin-bottom: 20px; }
  .add { display: flex; gap: 8px; }
  .add input { flex: 1; min-width: 0; }
  .add .btn { width: 48px; flex: none; padding: 0; font-size: 22px; }
  .ok { margin: 6px 0 0; color: var(--green); font-size: 14px; }
</style>

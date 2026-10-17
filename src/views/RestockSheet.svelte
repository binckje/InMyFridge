<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { applyRestock, formatQty, planRestock, type RestockLine } from '../lib/stock';
  import { clearChecked } from '../lib/shopping';
  import type { ShoppingItem } from '../lib/types';

  /** Fin des courses : ranger les articles achetés dans le stock, puis vider le panier. */
  let { items, onclose }: { items: ShoppingItem[]; onclose: (stored?: number) => void } = $props();

  let lines = $state<RestockLine[]>([]);
  planRestock(untrack(() => items)).then((l) => (lines = l));
  const count = $derived(lines.filter((l) => l.include).length);

  async function done(store: boolean) {
    const n = store ? await applyRestock($state.snapshot(lines) as RestockLine[]) : 0;
    await clearChecked();
    onclose(n);
  }

  const unit = (l: RestockLine) =>
    l.stock?.packs && l.stock.packSize
      ? `× ${String(l.stock.packSize).replace('.', ',')} ${l.stock.unit}`
      : l.stock?.unit && l.stock.unit !== 'pièce'
        ? l.stock.unit
        : '';
</script>

<button class="backdrop" aria-label="Fermer" onclick={() => onclose()} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 500, duration: 220 }} role="dialog" aria-label="Ranger les courses">
  <h2>🧺 Ranger les courses</h2>
  <p class="sub">Coche ce qui va dans le stock. Les produits déjà suivis sont cochés.</p>

  <ul>
    {#each lines as l (l.shoppingId)}
      <li class:off={!l.include}>
        <label class="tick">
          <input type="checkbox" bind:checked={l.include} />
          <span class="name">{l.name}</span>
        </label>
        {#if l.stock?.level}
          <span class="info">→ suffisamment</span>
        {:else if l.stock}
          <span class="info">{formatQty(l.stock)} +</span>
          <input class="qty" bind:value={l.qty} inputmode="decimal" placeholder="?" aria-label="Quantité achetée de {l.name}" />
          <span class="u">{unit(l)}</span>
        {:else}
          <span class="info new">nouveau</span>
          <input class="qty wide" bind:value={l.qty} placeholder="qté" aria-label="Quantité de {l.name}" />
        {/if}
      </li>
    {/each}
  </ul>

  <div class="actions">
    <button class="btn" onclick={() => done(true)} disabled={!count}>Ranger {count} produit{count > 1 ? 's' : ''} et vider le panier</button>
    <button class="btn ghost" onclick={() => done(false)}>Vider sans ranger</button>
  </div>
</div>

<style>
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
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 50;
  }
  h2 { margin: 0; font-size: 20px; }
  .sub { margin: 4px 0 12px; color: var(--muted); font-size: 15px; }
  ul { list-style: none; margin: 0; padding: 0; border-radius: var(--radius); background: var(--card); overflow: hidden; }
  li { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--line); min-height: 52px; }
  li:last-child { border-bottom: 0; }
  li.off .name { color: var(--muted); }
  .tick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
  .tick input { width: 22px; height: 22px; flex: none; accent-color: var(--green); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .info { flex: none; font-size: 14px; color: var(--muted); }
  .info.new { color: var(--green); }
  .qty { width: 64px; flex: none; padding: 6px 8px; text-align: center; }
  .qty.wide { width: 90px; }
  .u { flex: none; width: 20px; font-size: 14px; color: var(--muted); }
  .actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .btn:disabled { opacity: 0.4; }
</style>

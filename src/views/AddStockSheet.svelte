<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { locationById } from '../lib/locations.svelte';
  import { addStock, checkAdd, formatQty, type QtyKind } from '../lib/stock';
  import type { StockGroup, StockItem } from '../lib/types';

  /**
   * Passage obligé de tout ajout au stock : propose les groupes existants, et signale les produits
   * similaires déjà en stock (la quantité peut alors leur être ajoutée). Rien à demander → ajout direct.
   */
  let {
    input,
    locationId,
    kind,
    aisle,
    onclose
  }: {
    input: string;
    locationId?: string;
    kind?: QtyKind;
    aisle?: string;
    /** Produit créé ou complété ; undefined si l'ajout est annulé. */
    onclose: (added?: StockItem) => void;
  } = $props();

  let name = $state('');
  let groups = $state<StockGroup[]>([]);
  let similar = $state<StockItem[]>([]);
  let groupId = $state<string | undefined>();
  let picking = $state(false);
  let open = $state(false);

  const add = async (options: { groupId?: string; mergeInto?: string } = {}) =>
    onclose(await addStock(input, locationId, kind, aisle, options));

  untrack(() => checkAdd(input, locationId, kind, aisle)).then((c) => {
    if (!c) return onclose();
    if (c.exact || (!c.groups.length && !c.similar.length)) return add();
    ({ name, groups, similar } = c);
    open = true;
  });

  const group = $derived(groups.find((g) => g.id === groupId));
</script>

{#if open}
  <button class="backdrop" aria-label="Annuler" onclick={() => onclose()} transition:fade={{ duration: 150 }}></button>
  <div class="sheet" transition:fly={{ y: 500, duration: 220 }} role="dialog" aria-label="Ajouter {name} au stock">
    <div class="head">
      <h2>🧊 Ajouter « {name} »</h2>
      <button class="close" onclick={() => onclose()} aria-label="Annuler">✕</button>
    </div>

    {#if picking}
      <p class="sub">Ajouter la quantité à quel produit ?</p>
      <ul>
        {#each similar as s (s.id)}
          <li>
            <button class="pick" onclick={() => add({ mergeInto: s.id })}>
              <span class="n">{locationById(s.locationId).emoji} {s.name}</span>
              <span class="q">{formatQty(s)}</span>
            </button>
          </li>
        {/each}
      </ul>
      <button class="btn ghost wide" onclick={() => (picking = false)}>← Retour</button>
    {:else}
      {#if groups.length}
        <p class="sub">Groupe (facultatif)</p>
        <div class="chips">
          {#each groups as g (g.id)}
            <button class="chip" class:on={groupId === g.id} aria-pressed={groupId === g.id} onclick={() => (groupId = groupId === g.id ? undefined : g.id)}>
              {g.name}
            </button>
          {/each}
        </div>
      {/if}

      {#if similar.length}
        <p class="warn">
          Déjà en stock, peut-être le même produit : <strong>{similar.map((s) => s.name).join(', ')}</strong>.
          Ajouter la quantité à un produit existant ?
        </p>
        <div class="actions">
          <button class="btn" onclick={() => (picking = true)}>Oui, choisir</button>
          <button class="btn ghost" onclick={() => add({ groupId })}>
            Non, nouveau produit{group ? ` (${group.name})` : ''}
          </button>
        </div>
      {:else}
        <button class="btn wide" onclick={() => add({ groupId })}>
          {group ? `Ajouter au groupe ${group.name}` : 'Ajouter sans groupe'}
        </button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 60; }
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
    z-index: 70;
  }
  .head { display: flex; align-items: center; gap: 8px; }
  h2 { flex: 1; min-width: 0; margin: 0; font-size: 20px; overflow-wrap: anywhere; }
  .close { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--card); border: 1px solid var(--line); }
  .sub { margin: 12px 0 8px; color: var(--muted); font-size: 15px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 8px 14px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); }
  .chip.on { background: var(--green); border-color: var(--green); color: #fff; }
  .warn { margin: 16px 0 12px; padding: 12px; border-radius: var(--radius); background: var(--card); border: 1px solid var(--line); }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .wide { width: 100%; margin-top: 16px; }
  ul { list-style: none; margin: 0; padding: 0; border-radius: var(--radius); background: var(--card); overflow: hidden; }
  li { border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .pick { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 52px; padding: 8px 12px; text-align: left; background: none; border: 0; }
  .pick .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick .q { flex: none; color: var(--muted); font-size: 14px; }
</style>

<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { FORMATS, exportBlob, saveFile, type ExportFormat } from '../lib/recipe-export';
  import type { Recipe } from '../lib/types';

  /** Choix du format puis export (une recette ou toutes). */
  let { recipes, onclose }: { recipes: Recipe[]; onclose: () => void } = $props();

  const KEY = 'imf.exportFormat';
  let format = $state<ExportFormat>((localStorage.getItem(KEY) as ExportFormat) ?? 'pdf');
  let busy = $state(false);
  let error = $state('');

  async function go() {
    busy = true;
    error = '';
    try {
      localStorage.setItem(KEY, format);
      const { blob, name } = await exportBlob($state.snapshot(recipes) as Recipe[], format);
      await saveFile(blob, name);
      onclose();
    } catch {
      error = 'Export impossible.';
    } finally {
      busy = false;
    }
  }
</script>

<button class="backdrop" aria-label="Fermer" onclick={onclose} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 400, duration: 200 }} role="dialog" aria-label="Exporter">
  <h2>⬇️ Exporter {recipes.length === 1 ? `« ${recipes[0].name} »` : `${recipes.length} recettes`}</h2>
  <div class="formats">
    {#each FORMATS as f (f.id)}
      <button class:sel={format === f.id} onclick={() => (format = f.id)}>
        <strong>{f.label}</strong><span>{f.hint}</span>
      </button>
    {/each}
  </div>
  {#if error}<p class="err">{error}</p>{/if}
  <div class="actions">
    <button class="btn ghost" onclick={onclose}>Annuler</button>
    <button class="btn" onclick={go} disabled={busy}>{busy ? 'Préparation…' : 'Exporter'}</button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 70; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 80;
  }
  h2 { margin: 0; font-size: 18px; }
  .formats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .formats button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    border-radius: 12px;
    background: var(--card);
    border: 1px solid var(--line);
    text-align: left;
  }
  .formats button span { font-size: 13px; color: var(--muted); }
  .formats button.sel { border-color: var(--green); outline: 2px solid var(--green); }
  .err { margin: 0; color: var(--danger); }
  .actions { display: flex; justify-content: space-between; }
  .btn:disabled { opacity: 0.5; }
</style>

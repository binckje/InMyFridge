<script lang="ts">
  import { fade, fly, slide } from 'svelte/transition';
  import {
    LOCATIONS,
    addLocation,
    deleteLocation,
    moveLocation,
    newCategory,
    updateLocation
  } from '../lib/locations.svelte';
  import type { Category, Location } from '../lib/types';

  /** Configuration des emplacements (frigo, placards…) et de leurs sous-catégories. */
  let { onclose }: { onclose: () => void } = $props();

  let open = $state<string | null>(null);
  let newLabel = $state('');
  let newCat = $state('');
  let message = $state('');

  const EMOJIS = ['🧊', '❄️', '🥫', '🍫', '📦', '🧽', '🍷', '🥔', '🧺', '🗄️', '🚪', '🏠', '🧴', '🍞', '🥛', '🧂'];

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    open = await addLocation(newLabel);
    newLabel = '';
  }

  async function remove(l: Location) {
    const n = await deleteLocation(l.id);
    message =
      n > 0
        ? `« ${l.label} » contient ${n} produit${n > 1 ? 's' : ''} : déplace-les ou supprime-les d'abord.`
        : n < 0
          ? 'Il faut garder au moins un emplacement.'
          : '';
    if (!n) open = null;
  }

  const setCats = (l: Location, cats: Category[]) => updateLocation(l.id, { categories: cats.length ? cats : undefined });

  function addCat(e: SubmitEvent, l: Location) {
    e.preventDefault();
    if (!newCat.trim()) return;
    setCats(l, [...(l.categories ?? []), newCategory(newCat)]);
    newCat = '';
  }

  function moveCat(l: Location, i: number, dir: -1 | 1) {
    const cats = [...(l.categories ?? [])];
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    setCats(l, cats);
  }

  const renameCat = (l: Location, i: number, label: string) =>
    label.trim() && setCats(l, (l.categories ?? []).map((c, k) => (k === i ? { ...c, label: label.trim() } : c)));

  const removeCat = (l: Location, i: number) => setCats(l, (l.categories ?? []).filter((_, k) => k !== i));
</script>

<button class="backdrop" aria-label="Fermer" onclick={onclose} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 500, duration: 220 }} role="dialog" aria-label="Emplacements">
  <div class="head">
    <h2>⚙️ Emplacements</h2>
    <button class="close" onclick={onclose} aria-label="Fermer">✕</button>
  </div>
  <p class="sub">Renomme, réordonne, ajoute des emplacements et leurs sous-catégories. Partagé avec le foyer à la synchro.</p>

  {#if message}<p class="err" transition:slide>{message}</p>{/if}

  <ul class="locs">
    {#each LOCATIONS as l, i (l.id)}
      <li>
        <div class="line">
          <button class="name" onclick={() => (open = open === l.id ? null : l.id)} aria-expanded={open === l.id}>
            <span class="emoji">{l.emoji}</span>
            <span>{l.label}</span>
            {#if l.categories?.length}<span class="n">{l.categories.length} catég.</span>{/if}
          </button>
          <button class="mv" onclick={() => moveLocation(l.id, -1)} disabled={i === 0} aria-label="Monter {l.label}">↑</button>
          <button class="mv" onclick={() => moveLocation(l.id, 1)} disabled={i === LOCATIONS.length - 1} aria-label="Descendre {l.label}">↓</button>
        </div>

        {#if open === l.id}
          <div class="detail" transition:slide={{ duration: 180 }}>
            <input
              value={l.label}
              onchange={(e) => e.currentTarget.value.trim() && updateLocation(l.id, { label: e.currentTarget.value.trim() })}
              aria-label="Nom de l'emplacement"
            />
            <div class="emojis">
              {#each EMOJIS as em}
                <button class:sel={l.emoji === em} onclick={() => updateLocation(l.id, { emoji: em })}>{em}</button>
              {/each}
            </div>

            <span class="lbl">Sous-catégories {l.categories?.length ? '' : '(aucune)'}</span>
            {#each l.categories ?? [] as c, k (c.id)}
              <div class="cat">
                <span>{c.emoji}</span>
                <input value={c.label} onchange={(e) => renameCat(l, k, e.currentTarget.value)} aria-label="Nom de la catégorie" />
                <button class="mv" onclick={() => moveCat(l, k, -1)} disabled={k === 0} aria-label="Monter">↑</button>
                <button class="mv" onclick={() => removeCat(l, k)} aria-label="Supprimer {c.label}">✕</button>
              </div>
            {/each}
            <form class="addcat" onsubmit={(e) => addCat(e, l)}>
              <input bind:value={newCat} placeholder="Nouvelle sous-catégorie" aria-label="Nouvelle sous-catégorie" />
              <button class="btn ghost" type="submit" disabled={!newCat.trim()}>Ajouter</button>
            </form>

            <button class="btn danger" onclick={() => remove(l)}>Supprimer « {l.label} »</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <form class="add" onsubmit={add}>
    <input bind:value={newLabel} placeholder="Nouvel emplacement : cave, cellier…" aria-label="Nouvel emplacement" />
    <button class="btn" type="submit" disabled={!newLabel.trim()}>＋</button>
  </form>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 640px;
    max-height: 92vh;
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
  .sub { margin: 0; color: var(--muted); font-size: 14px; }
  .err { margin: 0; color: var(--danger); font-size: 15px; }

  .locs { list-style: none; margin: 0; padding: 0; border-radius: var(--radius); background: var(--card); overflow: hidden; }
  .locs > li { border-bottom: 1px solid var(--line); }
  .locs > li:last-child { border-bottom: 0; }
  .line { display: flex; align-items: center; padding-right: 6px; }
  .name { flex: 1; display: flex; align-items: center; gap: 10px; padding: 14px; text-align: left; }
  .emoji { font-size: 22px; }
  .n { margin-left: auto; font-size: 13px; color: var(--muted); }
  .mv { width: 36px; height: 36px; border-radius: 50%; color: var(--green); font-size: 18px; flex: none; }
  .mv:disabled { color: var(--line); }

  .detail { display: flex; flex-direction: column; gap: 10px; padding: 0 14px 14px; }
  .emojis { display: flex; flex-wrap: wrap; gap: 2px; }
  .emojis button { font-size: 22px; padding: 4px; border-radius: 8px; }
  .emojis button.sel { background: var(--green-soft); outline: 2px solid var(--green); }
  .lbl { font-size: 13px; color: var(--muted); }
  .cat { display: flex; align-items: center; gap: 6px; }
  .cat input { padding: 8px 10px; }
  .addcat, .add { display: flex; gap: 8px; }
  .addcat .btn, .add .btn { flex: none; }
  .add .btn { width: 48px; padding: 0; font-size: 22px; }
  .btn:disabled { opacity: 0.4; }
</style>

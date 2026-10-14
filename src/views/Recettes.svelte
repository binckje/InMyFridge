<script lang="ts">
  import { liveQuery } from 'dexie';
  import { fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { db } from '../lib/db';
  import { rank, tokens, type RecipeCheck } from '../lib/recipes';
  import type { Recipe } from '../lib/types';
  import RecipeSheet from './RecipeSheet.svelte';
  import RecipeEditor from './RecipeEditor.svelte';

  const recipes = liveQuery(() => db.recipes.filter((r) => !r.deleted).toArray());
  const stock = liveQuery(() => db.stock.filter((s) => !s.deleted).toArray());
  const ranked = $derived(rank($recipes ?? [], $stock ?? []));

  /* ---------- Filtres ---------- */
  type Filter = 'toutes' | 'faisables' | 'presque' | 'favorites';
  let filter = $state<Filter>('toutes');
  let text = $state('');

  const feasible = $derived(ranked.filter((c) => c.feasible));
  const almost = $derived(ranked.filter((c) => !c.feasible && c.missing.length <= 2));
  const favorites = $derived(ranked.filter((c) => (c.recipe.rating ?? 0) >= 4));

  /** Recherche dans le nom, les étiquettes et les ingrédients (« poulet », « dessert »…). */
  function found(c: RecipeCheck) {
    const q = tokens(text);
    if (!q.length) return true;
    const r = c.recipe;
    const hay = new Set(tokens([r.name, ...(r.tags ?? []), ...r.ingredients.map((i) => i.name)].join(' ')));
    return q.every((w) => [...hay].some((h) => h.startsWith(w)));
  }

  const shown = $derived(
    (filter === 'faisables' ? feasible : filter === 'presque' ? almost : filter === 'favorites' ? favorites : ranked).filter(found)
  );

  /* ---------- Feuilles ---------- */
  let openId = $state<string | null>(null);
  const opened = $derived(ranked.find((c) => c.recipe.id === openId)?.recipe ?? null);
  let editing = $state<Recipe | 'new' | null>(null);

  const stars = (n = 0) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const duration = (min?: number) =>
    !min ? '' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
</script>

<header>
  <h1>Recettes</h1>
  <p class="sub">
    {#if ranked.length === 0}
      Aucune recette pour l'instant.
    {:else if feasible.length}
      <strong class="ok">{feasible.length} faisable{feasible.length > 1 ? 's' : ''}</strong> avec ton stock{#if almost.length}{' · '}{almost.length} presque{/if}
    {:else}
      Rien de faisable à 100 %{#if almost.length}{' · '}<strong>{almost.length}</strong> à 1 ou 2 ingrédients près{/if}
    {/if}
  </p>
</header>

<div class="filters">
  <button class="chip" class:sel={filter === 'toutes'} onclick={() => (filter = 'toutes')}>Toutes <span class="n">{ranked.length}</span></button>
  <button class="chip" class:sel={filter === 'faisables'} onclick={() => (filter = 'faisables')}>✅ Faisables <span class="n">{feasible.length}</span></button>
  <button class="chip" class:sel={filter === 'presque'} onclick={() => (filter = 'presque')}>🛒 Presque <span class="n">{almost.length}</span></button>
  {#if favorites.length}
    <button class="chip" class:sel={filter === 'favorites'} onclick={() => (filter = 'favorites')}>⭐ Favorites <span class="n">{favorites.length}</span></button>
  {/if}
</div>

<div class="search">
  <input bind:value={text} placeholder="Chercher : nom, ingrédient, « dessert »…" enterkeyhint="search" autocomplete="off" aria-label="Chercher une recette" />
  <button class="btn" aria-label="Nouvelle recette" onclick={() => (editing = 'new')}>＋</button>
</div>

{#if shown.length === 0}
  <div class="empty" in:fade>
    <div class="big">🍳</div>
    {#if text.trim()}
      <p>Aucune recette pour « {text.trim()} ».</p>
    {:else if filter === 'faisables'}
      <p>Rien de faisable à 100 % avec le stock actuel.<br />Regarde « 🛒 Presque » : il ne manque qu'un ou deux ingrédients.</p>
    {:else}
      <p>Rien ici pour l'instant.</p>
    {/if}
  </div>
{/if}

<ul class="cards">
  {#each shown as c (c.recipe.id)}
    <li animate:flip={{ duration: 200 }}>
      <button class="card" onclick={() => (openId = c.recipe.id)}>
        <span class="emoji">{c.recipe.emoji ?? '🍽️'}</span>
        <span class="body">
          <span class="name">{c.recipe.name}</span>
          <span class="meta">
            {#if c.recipe.time}⏱ {duration(c.recipe.time)}{/if}
            {#if c.recipe.rating}<span class="stars">{stars(c.recipe.rating)}</span>{/if}
          </span>
          {#if c.feasible}
            <span class="status ok">✅ Faisable</span>
          {:else}
            <span class="status miss">Manque {c.missing.length} : {c.missing.map((m) => m.ingredient.name).join(', ')}</span>
          {/if}
        </span>
        <span class="ring" style="--p: {c.score}" aria-label="{Math.round(c.score * 100)} % des ingrédients"></span>
      </button>
    </li>
  {/each}
</ul>

{#if opened}
  <RecipeSheet
    recipe={opened}
    stock={$stock ?? []}
    onclose={() => (openId = null)}
    onedit={() => ((editing = opened), (openId = null))}
  />
{/if}

{#if editing}
  <RecipeEditor
    recipe={editing === 'new' ? null : editing}
    onclose={(id) => ((editing = null), id && (openId = id))}
  />
{/if}

<style>
  h1 { margin: 8px 0 0; font-size: 32px; }
  .sub { margin: 2px 0 10px; color: var(--muted); }
  .ok { color: var(--green); }

  .filters {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin: 0 -16px;
    padding: 0 16px 4px;
    scrollbar-width: none;
  }
  .filters::-webkit-scrollbar { display: none; }
  .chip {
    flex: none;
    white-space: nowrap;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--card);
    border: 1px solid var(--line);
    font-size: 15px;
  }
  .chip.sel { background: var(--green); border-color: var(--green); color: #fff; }
  .n { margin-left: 4px; opacity: 0.7; font-size: 13px; }

  .search {
    position: sticky;
    top: env(safe-area-inset-top);
    z-index: 5;
    display: flex;
    gap: 8px;
    padding: 12px 0 8px;
    background: var(--bg);
  }
  .search .btn { width: 48px; flex: none; padding: 0; font-size: 22px; }

  .cards { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--card);
    text-align: left;
    transition: transform 0.15s;
  }
  .card:active { transform: scale(0.98); }
  .emoji { font-size: 34px; flex: none; }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { font-weight: 600; }
  .meta { display: flex; gap: 10px; font-size: 13px; color: var(--muted); }
  .stars { color: var(--amber); letter-spacing: 1px; }
  .status { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status.ok { color: var(--green); font-weight: 600; }
  .status.miss { color: var(--muted); }

  /* Anneau de progression : part des ingrédients disponibles. */
  .ring {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: conic-gradient(var(--green) calc(var(--p) * 360deg), var(--line) 0);
    mask: radial-gradient(circle, transparent 9px, #000 10px);
    -webkit-mask: radial-gradient(circle, transparent 9px, #000 10px);
  }

  .empty { text-align: center; color: var(--muted); padding: 48px 16px; }
  .big { font-size: 64px; }
</style>

<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import {
    addMissingToShopping,
    checkRecipe,
    cook,
    formatIngredient,
    isSection,
    matchKind,
    rateRecipe,
    undoCook,
    yieldLabel,
    type Consumption
  } from '../lib/recipes';
  import { embedUrl, getVideo } from '../lib/media';
  import type { Recipe, StockItem } from '../lib/types';

  /** onsave : recette d'internet pas encore enregistrée (aperçu). */
  let {
    recipe,
    stock,
    onclose,
    onedit,
    onsave,
    onexport
  }: {
    recipe: Recipe;
    stock: StockItem[];
    onclose: () => void;
    onedit?: () => void;
    onsave?: () => void;
    onexport?: () => void;
  } = $props();

  /** Nombre de personnes (ou de pièces) : les quantités suivent. */
  let servings = $state(0);
  $effect.pre(() => {
    if (!servings) servings = recipe.servings;
  });
  const scale = $derived(servings / recipe.servings);
  /** Pas du −/+ : 1 personne, ou ~10 % de la fournée (20 cookies → 2 par 2). */
  const step = $derived(recipe.yieldUnit ? Math.max(1, Math.round(recipe.servings / 10)) : 1);
  /** Ingrédients pour lesquels on accepte le produit voisin suggéré (💡 Utiliser). */
  let useClose = $state(new Set<number>());
  const check = $derived(checkRecipe(recipe, stock, scale, useClose));
  /** Produit choisi pour chaque ingrédient (index → id du stock) quand plusieurs conviennent. */
  let choice = $state<Record<number, string>>({});
  const chosen = (n: number) => check.checks[n].stock.find((s) => s.id === choice[n]) ?? check.checks[n].stock[0];

  const ICON = { ok: '✅', low: '🟠', missing: '❌', basic: '🧂' } as const;
  const HINT = { ok: '', low: 'pas assez', missing: 'manque', basic: 'placard' } as const;

  /* ---------- Toast ---------- */
  let toast = $state<{ text: string; undo?: () => void } | null>(null);
  let timer: ReturnType<typeof setTimeout>;
  function show(text: string, undo?: () => void) {
    toast = { text, undo };
    clearTimeout(timer);
    timer = setTimeout(() => (toast = null), 5000);
  }

  async function shop() {
    const n = await addMissingToShopping(check, scale);
    navigator.vibrate?.(12);
    show(`${n} ingrédient${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} aux courses 🛒`);
  }

  let cooked: Consumption[] = [];
  async function cooking() {
    cooked = await cook(check, scale, $state.snapshot(choice));
    navigator.vibrate?.([12, 40, 12]);
    show(
      cooked.length ? `Bon appétit ! Stock mis à jour (${cooked.length} produit${cooked.length > 1 ? 's' : ''})` : 'Bon appétit !',
      cooked.length ? () => undoCook(cooked) : undefined
    );
  }

  /** Vidéo copiée sur l'appareil, lue depuis la base. */
  let localVideo = $state<string | undefined>();
  $effect(() => {
    let url: string | undefined;
    getVideo(recipe.id).then((v) => v && (localVideo = url = URL.createObjectURL(v.blob)));
    return () => url && URL.revokeObjectURL(url);
  });
  const embed = $derived(recipe.video ? embedUrl(recipe.video) : undefined);

  const rate = (n: number) => rateRecipe(recipe.id, recipe.rating === n ? 0 : n);
</script>

<button class="backdrop" aria-label="Fermer" onclick={onclose} transition:fade={{ duration: 150 }}></button>
<div class="sheet" transition:fly={{ y: 500, duration: 220 }} role="dialog" aria-label={recipe.name}>
  <div class="top">
    <span class="emoji">{recipe.emoji ?? '🍽️'}</span>
    <div class="title">
      <h2>{recipe.name}</h2>
      {#if !onsave}
        <div class="stars" role="group" aria-label="Note">
          {#each [1, 2, 3, 4, 5] as n}
            <button class:on={(recipe.rating ?? 0) >= n} onclick={() => rate(n)} aria-label="{n} étoile{n > 1 ? 's' : ''}">★</button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="close" onclick={onclose} aria-label="Fermer">✕</button>
  </div>

  <div class="photo">
    {#if recipe.image}<img src={recipe.image} alt="" loading="lazy" />{:else}<span>{recipe.emoji ?? '🍽️'}</span>{/if}
  </div>
  {#if onsave}
    <button class="btn save" onclick={onsave}>💾 Enregistrer dans mes recettes</button>
  {/if}
  {#if recipe.source === 'web'}<p class="web">🌐 Recette TheMealDB : ingrédients traduits, étapes en anglais.</p>{/if}

  <div class="facts">
    {#if recipe.prepTime || recipe.cookTime || recipe.restTime}
      {#if recipe.prepTime}<span>🔪 Préparation {recipe.prepTime} min</span>{/if}
      {#if recipe.cookTime}<span>🔥 Cuisson {recipe.cookTime} min</span>{/if}
      {#if recipe.restTime}<span>⏸️ Repos {recipe.restTime} min</span>{/if}
    {:else if recipe.time}<span>⏱ {recipe.time} min</span>{/if}
    <span class="servings">
      <button onclick={() => (servings = Math.max(1, servings - step))} disabled={servings <= 1} aria-label="Moins">−</button>
      {recipe.yieldUnit ? '🔢' : '👥'} {yieldLabel(servings, recipe.yieldUnit)}
      <button onclick={() => (servings += step)} aria-label="Plus">+</button>
    </span>
    {#each recipe.tags ?? [] as t}<span class="tag">{t}</span>{/each}
  </div>

  {#if check.feasible}
    <p class="verdict ok">✅ Tu as tout ce qu'il faut !</p>
  {:else}
    <p class="verdict miss">Il manque {check.missing.length} ingrédient{check.missing.length > 1 ? 's' : ''}</p>
  {/if}

  <h3>Ingrédients</h3>
  <ul class="ings">
    {#each check.checks as c, n}
      {#if isSection(c.ingredient)}
      <li class="sec">{formatIngredient(c.ingredient)}</li>
      {:else}
      <li class={c.status} class:opt={c.ingredient.optional}>
        <span class="ic">{ICON[c.status]}</span>
        <span class="txt">{formatIngredient(c.ingredient, scale)}{#if c.ingredient.optional}<em> (facultatif)</em>{/if}</span>
        {#if HINT[c.status]}<span class="hint">{HINT[c.status]}</span>{/if}
        {#if c.status !== 'basic' && c.status !== 'missing' && c.stock.length > 1}
          <select class="pick" value={chosen(n).id} onchange={(e) => (choice[n] = e.currentTarget.value)} aria-label="Produit utilisé">
            {#each c.stock as s}<option value={s.id}>{s.name}</option>{/each}
          </select>
        {/if}
        {#if c.status !== 'basic' && c.stock.length && matchKind(c.ingredient.name, chosen(n).name) !== 'exact'}
          <span class="sub">⚠️ remplacé par « {chosen(n).name} »</span>
        {/if}
        {#if c.close && !useClose.has(n)}
          <span class="near">
            💡 Tu as : {c.close.map((s) => s.name).join(', ')}
            <button class="use" onclick={() => (useClose = new Set(useClose).add(n))}>Utiliser</button>
          </span>
        {/if}
      </li>
      {/if}
    {/each}
  </ul>

  <div class="actions">
    {#if check.missing.length}
      <button class="btn" onclick={shop}>🛒 Ajouter {check.missing.length} manquant{check.missing.length > 1 ? 's' : ''} aux courses</button>
    {/if}
    <button class="btn ghost" onclick={cooking}>👩‍🍳 J'ai cuisiné ça</button>
  </div>

  {#if recipe.steps.length}
    <h3>Préparation</h3>
    <ol class="steps">
      {#each recipe.steps as s}<li>{s}</li>{/each}
    </ol>
  {/if}

  {#if localVideo || recipe.video}
    <h3>Vidéo</h3>
    {#if localVideo}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="video" src={localVideo} controls playsinline preload="metadata"></video>
    {:else if embed}
      <iframe class="video" src={embed} title="Vidéo de la recette" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy"></iframe>
    {/if}
    {#if recipe.video && !embed}
      <p class="src"><a href={recipe.video} target="_blank" rel="noopener">▶️ Voir la vidéo ↗</a></p>
    {/if}
  {/if}

  {#if recipe.url}
    <p class="src"><a href={recipe.url} target="_blank" rel="noopener">Voir la recette d'origine ↗</a></p>
  {/if}

  {#if onedit}
    <div class="foot">
      <button class="link" onclick={onedit}>✏️ Modifier la recette</button>
      {#if onexport}<button class="link" onclick={onexport}>⬇️ Exporter</button>{/if}
    </div>
  {/if}
</div>

{#if toast}
  <div class="toast" transition:fly={{ y: 40 }}>
    {toast.text}
    {#if toast.undo}<button onclick={() => (toast?.undo?.(), (toast = null))}>Annuler</button>{/if}
  </div>
{/if}

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
    padding: 18px 16px calc(env(safe-area-inset-bottom) + 20px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 50;
  }
  .top { display: flex; align-items: flex-start; gap: 12px; }
  .emoji { font-size: 44px; line-height: 1; }
  .title { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 22px; }
  .close { font-size: 20px; padding: 4px 8px; color: var(--muted); }
  .stars button { font-size: 22px; color: var(--line); padding: 0 2px; transition: transform 0.15s; }
  .stars button.on { color: var(--amber); }
  .stars button:active { transform: scale(1.3); }

  .photo { aspect-ratio: 4 / 3; margin-top: 12px; border-radius: var(--radius); overflow: hidden; background: var(--card); display: grid; place-items: center; font-size: 72px; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .video { display: block; width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: var(--radius); background: #000; }
  .save { width: 100%; margin-top: 12px; }
  .web { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
  .facts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 12px 0 4px; color: var(--muted); font-size: 15px; }
  .servings { display: inline-flex; align-items: center; gap: 6px; }
  .servings button {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--green-soft);
    color: var(--text);
    font-size: 18px;
    line-height: 1;
  }
  .servings button:disabled { opacity: 0.4; }
  .pick { flex-basis: 100%; margin: 4px 0 0 28px; max-width: calc(100% - 28px); font-size: 14px; }
  .sub { flex-basis: 100%; margin-left: 28px; font-size: 13px; color: var(--amber); }
  .near { flex-basis: 100%; margin-left: 28px; font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .use { font-size: 13px; padding: 2px 10px; border-radius: 12px; border: 1px solid var(--muted); background: none; color: inherit; }
  .tag { padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); font-size: 13px; }

  .verdict { margin: 10px 0; font-weight: 600; }
  .verdict.ok { color: var(--green); }
  .verdict.miss { color: var(--amber); }

  h3 { margin: 18px 0 6px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .ings { list-style: none; margin: 0; padding: 0; border-radius: var(--radius); background: var(--card); overflow: hidden; }
  .ings li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .ings li:last-child { border-bottom: 0; }
  .ings li.sec { font-weight: 700; background: var(--line); padding: 6px 14px; }
  .ings li.opt { opacity: 0.7; }
  .ings .txt { flex: 1; }
  .ings em { color: var(--muted); font-size: 14px; }
  .ings .hint { font-size: 12px; font-weight: 600; text-transform: uppercase; }
  .ings .missing .hint { color: var(--danger); }
  .ings .low .hint { color: var(--amber); }
  .ings .basic .hint { color: var(--muted); font-weight: 400; text-transform: none; }

  .actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }

  .steps { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; }
  .steps li::marker { color: var(--green); font-weight: 700; }

  .src a { color: var(--green); }
  .foot { margin-top: 20px; text-align: center; }
  .link { color: var(--muted); font-size: 15px; padding: 8px; }

  .toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(env(safe-area-inset-bottom) + 16px);
    max-width: 608px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #292524;
    color: #fff;
    z-index: 60;
  }
  .toast button { color: #86efac; font-weight: 700; flex: none; }
</style>

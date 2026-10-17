<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { CATEGORIES, categoryOf, deleteRecipe, formatIngredient, parseIngredient, saveRecipe, withCategory, type Category } from '../lib/recipes';
  import type { Recipe } from '../lib/types';

  /**
   * recipe : recette à modifier, ou fiche importée sans id (nouvelle recette pré-remplie).
   * onclose(id) : id de la recette enregistrée (pour la rouvrir), rien si annulé.
   */
  let { recipe, onclose }: { recipe: Recipe | null; onclose: (id?: string) => void } = $props();

  const r = untrack(() => recipe);
  const isNew = !r?.id;
  const imported = !!r && isNew;
  let form = $state({
    name: r?.name ?? '',
    emoji: r?.emoji ?? '🍽️',
    servings: String(r?.servings ?? 4),
    yieldUnit: r?.yieldUnit ?? '',
    // ancienne recette sans détail : le temps total passe en préparation
    prepTime: String(r?.prepTime ?? (r?.cookTime ? '' : (r?.time ?? ''))),
    cookTime: String(r?.cookTime ?? ''),
    tags: (r?.tags ?? []).join(', '),
    ingredients: (r?.ingredients ?? []).map((i) => formatIngredient(i) + (i.optional ? ' (facultatif)' : '')).join('\n'),
    steps: (r?.steps ?? []).join('\n')
  });

  const tagList = (s: string) => s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const category = $derived(categoryOf(tagList(form.tags)));
  /** Choisir une catégorie met à jour l'étiquette correspondante (re-toucher la retire). */
  const pickCategory = (c: Category) => (form.tags = withCategory(tagList(form.tags), category === c ? undefined : c).join(', '));

  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const valid = $derived(form.name.trim() && lines(form.ingredients).length);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!valid) return;
    const id = await saveRecipe({
      id: r?.id || undefined,
      name: form.name.trim(),
      emoji: form.emoji.trim() || undefined,
      servings: Math.max(1, parseInt(form.servings) || 4),
      yieldUnit: /^(pers|$)/i.test(form.yieldUnit.trim()) ? undefined : form.yieldUnit.trim(),
      prepTime: parseInt(form.prepTime) || undefined,
      cookTime: parseInt(form.cookTime) || undefined,
      time: (parseInt(form.prepTime) || 0) + (parseInt(form.cookTime) || 0) || undefined,
      tags: tagList(form.tags),
      ingredients: lines(form.ingredients).map(parseIngredient),
      steps: lines(form.steps).map((s) => s.replace(/^\d+[.)]\s*/, '')),
      rating: r?.rating,
      url: r?.url,
      source: r?.source ?? 'perso'
    });
    onclose(id);
  }

  async function remove() {
    if (!r || !confirm(`Supprimer « ${r.name} » ?`)) return;
    await deleteRecipe(r.id);
    onclose();
  }

  const EMOJIS = [...new Set([form.emoji, '🍽️', '🥗', '🍲', '🍝', '🍕', '🥘', '🍛', '🍗', '🐟', '🥩', '🥚', '🧀', '🥧', '🍰', '🍫', '🍪', '🥞', '🍎'])];
</script>

<button class="backdrop" aria-label="Fermer" onclick={() => onclose()} transition:fade={{ duration: 150 }}></button>
<form class="sheet" onsubmit={save} transition:fly={{ y: 500, duration: 220 }}>
  <h2>{isNew ? (imported ? 'Recette importée' : 'Nouvelle recette') : 'Modifier la recette'}</h2>

  {#if imported}
    <p class="imported">📄 Vérifie la fiche : ingrédients et étapes ont été repérés automatiquement. Corrige si besoin, puis enregistre.</p>
  {/if}
  <input bind:value={form.name} placeholder="Nom de la recette" aria-label="Nom" />

  <div class="emojis">
    {#each EMOJIS as e}
      <button type="button" class:sel={form.emoji === e} onclick={() => (form.emoji = e)}>{e}</button>
    {/each}
  </div>

  <div class="row">
    <label>
      <span class="lbl">Quantité</span>
      <input bind:value={form.servings} inputmode="numeric" aria-label="Quantité" />
    </label>
    <label>
      <span class="lbl">Unité (vide = personnes)</span>
      <input bind:value={form.yieldUnit} placeholder="personnes" aria-label="Unité" />
    </label>
  </div>

  <div class="row">
    <label>
      <span class="lbl">Préparation (min)</span>
      <input bind:value={form.prepTime} inputmode="numeric" placeholder="—" aria-label="Préparation" />
    </label>
    <label>
      <span class="lbl">Cuisson (min)</span>
      <input bind:value={form.cookTime} inputmode="numeric" placeholder="—" aria-label="Cuisson" />
    </label>
  </div>

  <label>
    <span class="lbl">Ingrédients — un par ligne, ex. « 200 g farine », « 3 oeufs », « sel »</span>
    <textarea bind:value={form.ingredients} rows="7" placeholder={'250 g farine\n4 oeufs\n500 ml lait\n1 pincée de sel'}></textarea>
  </label>

  <label>
    <span class="lbl">Étapes — une par ligne</span>
    <textarea bind:value={form.steps} rows="6"></textarea>
  </label>

  <div class="cats" role="group" aria-label="Catégorie">
    <span class="lbl">Catégorie</span>
    <div>
      {#each CATEGORIES as c}
        <button type="button" class="cat" class:sel={category === c.key} aria-pressed={category === c.key} onclick={() => pickCategory(c.key)}>{c.emoji} {c.label}</button>
      {/each}
    </div>
  </div>

  <label>
    <span class="lbl">Étiquettes (séparées par des virgules)</span>
    <input bind:value={form.tags} placeholder="dessert, rapide…" aria-label="Étiquettes" />
  </label>

  <div class="actions">
    {#if !isNew}
      <button type="button" class="btn danger" onclick={remove}>Supprimer</button>
    {:else}
      <button type="button" class="btn danger" onclick={() => onclose()}>Annuler</button>
    {/if}
    <button type="submit" class="btn" disabled={!valid}>Enregistrer</button>
  </div>
</form>

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 70; }
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
    gap: 14px;
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 80;
  }
  h2 { margin: 0; font-size: 20px; }
  .cats { display: flex; flex-direction: column; gap: 6px; }
  .cats div { display: flex; flex-wrap: wrap; gap: 8px; }
  .cat { padding: 6px 12px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); font-size: 15px; }
  .cat.sel { background: var(--green); border-color: var(--green); color: #fff; }
  label { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .lbl { font-size: 13px; color: var(--muted); }
  .row { display: flex; gap: 8px; }
  textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    font: inherit;
    font-size: 16px;
    color: inherit;
    resize: vertical;
  }
  textarea:focus { outline: 2px solid var(--green); border-color: transparent; }
  .emojis { display: flex; flex-wrap: wrap; gap: 4px; }
  .emojis button { font-size: 24px; padding: 4px; border-radius: 10px; }
  .emojis button.sel { background: var(--green-soft); outline: 2px solid var(--green); }
  .actions { display: flex; justify-content: space-between; }
  .btn:disabled { opacity: 0.4; }
  .imported { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--green-soft); font-size: 14px; }
</style>

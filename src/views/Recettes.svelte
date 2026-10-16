<script lang="ts">
  import { liveQuery } from 'dexie';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { db } from '../lib/db';
  import { CATEGORIES, categoryOf, deleteRecipe, rank, saveRecipe, setCategory, tokens, type Category, type RecipeCheck } from '../lib/recipes';
  import { fetchWebRecipe, ideasFromStock, searchWeb, type WebHit } from '../lib/web-recipes';
  import type { Recipe } from '../lib/types';
  import RecipeSheet from './RecipeSheet.svelte';
  import RecipeEditor from './RecipeEditor.svelte';
  import ExportSheet from './ExportSheet.svelte';
  import { IMPORT_ACCEPT, fileText, parseRecipeJson, parseRecipeText } from '../lib/recipe-import';

  const recipes = liveQuery(() => db.recipes.filter((r) => !r.deleted).toArray());
  const stock = liveQuery(() => db.stock.filter((s) => !s.deleted).toArray());
  const ranked = $derived(rank($recipes ?? [], $stock ?? []));

  /* ---------- Filtres ---------- */
  type Filter = 'toutes' | 'faisables' | 'presque' | 'favorites';
  let filter = $state<Filter>('toutes');
  let text = $state('');
  let cat = $state<Category | null>(null);
  const catCount = (k: Category) => ranked.filter((c) => categoryOf(c.recipe.tags) === k).length;

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
    (filter === 'faisables' ? feasible : filter === 'presque' ? almost : filter === 'favorites' ? favorites : ranked).filter((c) => found(c) && (!cat || categoryOf(c.recipe.tags) === cat))
  );

  /* ---------- Sélection : modifier / supprimer / exporter ---------- */
  let selecting = $state(false);
  let selected = $state<Set<string>>(new Set());
  const picked = $derived(shown.filter((c) => selected.has(c.recipe.id)).map((c) => c.recipe));
  const allPicked = $derived(shown.length > 0 && picked.length === shown.length);

  function toggle(id: string) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    selected = next;
  }
  const toggleAll = () => (selected = allPicked ? new Set() : new Set(shown.map((c) => c.recipe.id)));
  const stopSelecting = () => ((selecting = false), (selected = new Set()));

  function editPicked() {
    if (picked.length !== 1) return;
    editing = picked[0];
    stopSelecting();
  }

  let categorizing = $state(false);
  async function categorizePicked(c?: Category) {
    const n = picked.length;
    await setCategory(picked.map((r) => r.id), c);
    categorizing = false;
    stopSelecting();
    const label = CATEGORIES.find((x) => x.key === c)?.label;
    toast = label ? `${n} recette${n > 1 ? 's' : ''} → ${label}` : `Catégorie retirée (${n})`;
    setTimeout(() => (toast = ''), 3000);
  }

  async function deletePicked() {
    const n = picked.length;
    if (!n || !confirm(`Supprimer ${n} recette${n > 1 ? 's' : ''} ? Cette action est définitive.`)) return;
    for (const r of picked) await deleteRecipe(r.id);
    stopSelecting();
    toast = `${n} recette${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`;
    setTimeout(() => (toast = ''), 3000);
  }

  /* ---------- Feuilles ---------- */
  let openId = $state<string | null>(null);
  const opened = $derived(ranked.find((c) => c.recipe.id === openId)?.recipe ?? null);
  let editing = $state.raw<Recipe | 'new' | null>(null);

  /* ---------- Ajout : saisie, fichier, photo ---------- */
  let adding = $state(false);
  let importing = $state('');
  let importError = $state('');
  let exporting = $state.raw<Recipe[] | null>(null);
  let toast = $state('');

  /** Fiche importée : pas d'id, l'éditeur l'enregistre comme nouvelle recette. */
  const draft = (r: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) => ({ ...r, id: '', createdAt: 0, updatedAt: 0 }) as Recipe;

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    importError = '';
    importing = `Lecture de « ${file.name} »…`;
    try {
      const text = await fileText(file);
      if (/\.json$/i.test(file.name)) {
        const list = parseRecipeJson(text);
        if (!list.length) throw new Error('Aucune recette dans ce fichier.');
        if (list.length === 1) editing = draft(list[0]);
        else {
          for (const r of list) await saveRecipe(r);
          toast = `${list.length} recettes importées`;
          setTimeout(() => (toast = ''), 3000);
        }
      } else editing = draft(parseRecipeText(text));
      adding = false;
    } catch (err) {
      importError = err instanceof Error && err.message.length < 120 ? err.message : 'Fichier illisible.';
    } finally {
      importing = '';
    }
  }

  async function importPhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    importError = '';
    importing = 'Lecture de la photo…';
    try {
      const { readPhoto } = await import('../lib/ocr');
      const lines = await readPhoto(file, (p) => (importing = `Lecture de la photo… ${Math.round(p * 100)} %`));
      editing = draft(parseRecipeText(lines.map((l) => l.text).join('\n')));
      adding = false;
    } catch {
      importError = 'Lecture de la photo impossible (première utilisation : connexion internet nécessaire).';
    } finally {
      importing = '';
    }
  }

  /* ---------- Internet ---------- */
  let web = $state<{ title: string; hits: WebHit[] } | null>(null);
  let webBusy = $state(false);
  let webError = $state('');
  let preview = $state.raw<Recipe | null>(null);

  async function runWeb(title: string, search: () => Promise<WebHit[]>) {
    webBusy = true;
    webError = '';
    try {
      web = { title, hits: await search() };
    } catch {
      webError = 'Recherche impossible : vérifie la connexion internet.';
    } finally {
      webBusy = false;
    }
  }
  const searchOnline = () => runWeb(`« ${text.trim()} » sur internet`, () => searchWeb(text.trim()));
  const ideas = () =>
    runWeb('Idées avec ton stock', () => ideasFromStock(($stock ?? []).map((s) => s.name)));
  $effect(() => {
    void text;
    web = null;
  });

  async function openWeb(h: WebHit) {
    if (($recipes ?? []).some((r) => r.id === `web-${h.id}`)) return (openId = `web-${h.id}`);
    webBusy = true;
    try {
      preview = await fetchWebRecipe(h.id);
    } catch {
      webError = 'Recette introuvable : vérifie la connexion internet.';
    } finally {
      webBusy = false;
    }
  }

  async function savePreview() {
    if (!preview) return;
    const { id, createdAt, updatedAt, ...rest } = preview;
    openId = await saveRecipe({ ...rest, id });
    preview = null;
  }

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

<div class="filters cats">
  {#each CATEGORIES as c}
    <button class="chip" class:sel={cat === c.key} aria-pressed={cat === c.key} onclick={() => (cat = cat === c.key ? null : c.key)}>
      {c.emoji} {c.label} <span class="n">{catCount(c.key)}</span>
    </button>
  {/each}
</div>

{#if ranked.length}
  <div class="selbar">
    {#if selecting}
      <button class="link" onclick={toggleAll}>{allPicked ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
      <span class="count">{picked.length} sélectionnée{picked.length > 1 ? 's' : ''}</span>
      <button class="link" onclick={stopSelecting}>Terminer</button>
    {:else}
      <button class="link" onclick={() => (selecting = true)}>☑️ Sélectionner</button>
    {/if}
  </div>
{/if}

<div class="search">
  <input bind:value={text} placeholder="Chercher : nom, ingrédient, « dessert »…" enterkeyhint="search" autocomplete="off" aria-label="Chercher une recette" />
  <button class="btn" aria-label="Ajouter une recette" onclick={() => ((adding = true), (importError = ''))}>＋</button>
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
      <button
        class="card"
        class:picked={selecting && selected.has(c.recipe.id)}
        aria-pressed={selecting ? selected.has(c.recipe.id) : undefined}
        onclick={() => (selecting ? toggle(c.recipe.id) : (openId = c.recipe.id))}
      >
        {#if selecting}<span class="check" aria-hidden="true">{selected.has(c.recipe.id) ? '✓' : ''}</span>{/if}
        {#if c.recipe.image}<img src="{c.recipe.image}/preview" alt="" loading="lazy" />{:else}<span class="emoji">{c.recipe.emoji ?? '🍽️'}</span>{/if}
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

{#if selecting}
  <div class="actions" transition:fly={{ y: 40, duration: 150 }}>
    <button class="btn ghost" onclick={editPicked} disabled={picked.length !== 1}>✏️ Modifier</button>
    <button class="btn ghost" onclick={() => (categorizing = true)} disabled={!picked.length}>🏷️ Catégorie</button>
    <button class="btn ghost" onclick={() => (exporting = picked)} disabled={!picked.length}>⬇️ Exporter</button>
    <button class="btn danger" onclick={deletePicked} disabled={!picked.length}>🗑️ Supprimer{picked.length ? ` (${picked.length})` : ''}</button>
  </div>
{:else if shown.length > 1}
  <button class="link export" onclick={() => (exporting = shown.map((c) => c.recipe))}>⬇️ Exporter ces {shown.length} recettes</button>
{/if}

<div class="web">
  {#if text.trim()}
    <button class="btn ghost" onclick={searchOnline} disabled={webBusy}>🌐 Chercher « {text.trim()} » sur internet</button>
  {:else}
    <button class="btn ghost" onclick={ideas} disabled={webBusy || !($stock ?? []).length}>🌐 Idées sur internet avec mon stock</button>
  {/if}
  {#if webBusy}<p class="hint">Recherche…</p>{/if}
  {#if webError}<p class="err">{webError}</p>{/if}
  {#if web}
    <h2>{web.title} <span>{web.hits.length}</span></h2>
    {#if !web.hits.length}
      <p class="hint">Rien trouvé. Les recettes internet sont en anglais : essaie un ingrédient (« poulet ») ou un plat (« curry »).</p>
    {/if}
    <ul class="cards">
      {#each web.hits as h (h.id)}
        <li>
          <button class="card" onclick={() => openWeb(h)}>
            {#if h.image}<img src="{h.image}/preview" alt="" loading="lazy" />{:else}<span class="emoji">🌐</span>{/if}
            <span class="body"><span class="name">{h.name}</span></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if preview}
  <RecipeSheet recipe={preview} stock={$stock ?? []} onclose={() => (preview = null)} onsave={savePreview} />
{/if}

{#if opened}
  <RecipeSheet
    recipe={opened}
    stock={$stock ?? []}
    onclose={() => (openId = null)}
    onedit={() => ((editing = opened), (openId = null))}
    onexport={() => (exporting = [opened!])}
  />
{/if}

{#if adding}
  <button class="backdrop" aria-label="Fermer" onclick={() => (adding = false)} transition:fade={{ duration: 150 }}></button>
  <div class="sheet" transition:fly={{ y: 300, duration: 200 }} role="dialog" aria-label="Ajouter une recette">
    <h2>Ajouter une recette</h2>
    <button class="btn ghost opt" onclick={() => ((adding = false), (editing = 'new'))}>✏️ Saisir à la main</button>
    <label class="btn ghost opt">
      📄 Importer un fichier <small>PDF, Word, RTF, texte, JSON</small>
      <input type="file" accept={IMPORT_ACCEPT} onchange={importFile} hidden />
    </label>
    <label class="btn ghost opt">
      📸 Photo d'une recette <small>livre, fiche, magazine</small>
      <input type="file" accept="image/*" onchange={importPhoto} hidden />
    </label>
    {#if importing}<p class="hint">{importing}</p>{/if}
    {#if importError}<p class="err">{importError}</p>{/if}
    <p class="hint">Une recette par fichier. La fiche est remplie automatiquement, tu la vérifies avant d'enregistrer.</p>
  </div>
{/if}

{#if categorizing}
  <button class="backdrop" aria-label="Fermer" onclick={() => (categorizing = false)} transition:fade={{ duration: 150 }}></button>
  <div class="sheet" transition:fly={{ y: 300, duration: 200 }} role="dialog" aria-label="Choisir une catégorie">
    <h2>Classer {picked.length} recette{picked.length > 1 ? 's' : ''} dans…</h2>
    {#each CATEGORIES as c}
      <button class="btn ghost opt" onclick={() => categorizePicked(c.key)}>{c.emoji} {c.label}</button>
    {/each}
    <button class="link" onclick={() => categorizePicked()}>Retirer la catégorie</button>
  </div>
{/if}

{#if exporting}
  <ExportSheet recipes={exporting} onclose={() => (exporting = null)} />
{/if}

{#if toast}
  <div class="toast" transition:fly={{ y: 40 }}>{toast}</div>
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
  .filters.cats { margin-top: 8px; }
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

  .web { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
  .web h2 { margin: 10px 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .web h2 span { font-weight: 400; }
  .web .btn:disabled { opacity: 0.5; }
  .card img { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; flex: none; }
  .hint { margin: 0; color: var(--muted); font-size: 14px; }
  .err { margin: 0; color: var(--danger); font-size: 14px; }

  .selbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 15px; }
  .selbar .link { color: var(--green); padding: 4px 0; }
  .selbar .count { color: var(--muted); font-size: 14px; }
  .card.picked { outline: 2px solid var(--green); }
  .check {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--line);
    display: grid;
    place-items: center;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .picked .check { background: var(--green); border-color: var(--green); }
  .actions {
    position: sticky;
    bottom: calc(var(--tabbar) + env(safe-area-inset-bottom) + 8px);
    z-index: 6;
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding: 8px;
    border-radius: var(--radius);
    background: var(--bg);
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.15);
  }
  .actions { flex-wrap: wrap; }
  .actions .btn { flex: 1 1 40%; padding-left: 4px; padding-right: 4px; font-size: 14px; }
  .actions .btn:disabled { opacity: 0.4; }
  .export { display: block; margin: 12px auto 0; color: var(--muted); font-size: 15px; padding: 8px; }
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
    gap: 10px;
    padding: 20px 16px calc(env(safe-area-inset-bottom) + 16px);
    border-radius: 20px 20px 0 0;
    background: var(--bg);
    z-index: 50;
  }
  .sheet .link { color: var(--muted); padding: 8px; }
  .sheet h2 { margin: 0 0 4px; font-size: 20px; }
  .opt { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .opt small { font-weight: 400; color: var(--muted); font-size: 13px; }
  .toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(var(--tabbar) + env(safe-area-inset-bottom) + 12px);
    max-width: 608px;
    margin: 0 auto;
    padding: 12px 16px;
    border-radius: 12px;
    background: #292524;
    color: #fff;
    z-index: 20;
  }

  .empty { text-align: center; color: var(--muted); padding: 48px 16px; }
  .big { font-size: 64px; }
</style>

<script lang="ts">
  import Home from './views/Home.svelte';
  import Courses from './views/Courses.svelte';
  import Stock from './views/Stock.svelte';
  import Recettes from './views/Recettes.svelte';
  import SyncSheet from './views/SyncSheet.svelte';
  import type { Pending } from './lib/drive';
  import { db } from './lib/db';
  import { liveQuery } from 'dexie';
  import { untrack } from 'svelte';
  import { lastSaved, localChange, onSaved } from './lib/safety';

  let { pending = null }: { pending?: Pending | null } = $props();
  let syncOpen = $state(untrack(() => !!pending));

  type Tab = 'accueil' | 'stock' | 'courses' | 'recettes';
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'accueil', label: 'Accueil', icon: '🏠' },
    { id: 'stock', label: 'Stock', icon: '🧊' },
    { id: 'courses', label: 'Courses', icon: '🛒' },
    { id: 'recettes', label: 'Recettes', icon: '🍳' }
  ];

  const initial = location.hash.slice(1) as Tab;
  let tab = $state<Tab>(tabs.some((t) => t.id === initial) ? initial : 'accueil');
  $effect(() => {
    history.replaceState(null, '', `#${tab}`);
  });

  let saved = $state(lastSaved());
  onSaved(() => (saved = lastSaved()));
  const unsaved = $derived(($localChange ?? 0) > saved);

  const toBuy = liveQuery(() => db.shopping.filter((i) => !i.deleted && !i.checked).count());
</script>

<main>
  <button class="cloud" aria-label={unsaved ? 'Synchro (modifications non sauvegardées)' : 'Synchro'} onclick={() => (syncOpen = true)}>
    ☁️{#if unsaved}<span class="dot"></span>{/if}
  </button>
  {#if tab === 'accueil'}
    <Home ongo={(t) => (tab = t)} />
  {:else if tab === 'courses'}
    <Courses />
  {:else if tab === 'stock'}
    <Stock />
  {:else}
    <Recettes />
  {/if}
</main>

<nav>
  {#each tabs as t}
    <button class:active={tab === t.id} onclick={() => (tab = t.id)}>
      <span class="icon">{t.icon}</span>
      <span>{t.label}</span>
      {#if t.id === 'courses' && $toBuy}
        <span class="badge">{$toBuy}</span>
      {/if}
    </button>
  {/each}
</nav>

{#if syncOpen}
  <SyncSheet {pending} onclose={() => ((syncOpen = false), (pending = null))} />
{/if}

<style>
  main {
    position: relative;
    max-width: 640px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top) + 12px) 16px
      calc(var(--tabbar) + env(safe-area-inset-bottom) + 24px);
  }
  .cloud {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 14px);
    right: 16px;
    font-size: 24px;
    padding: 4px;
    z-index: 5;
  }
  .dot {
    position: absolute;
    top: 4px;
    right: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #f39c12;
    border: 2px solid var(--bg);
  }
  nav {
    position: fixed;
    inset: auto 0 0 0;
    display: flex;
    justify-content: space-around;
    height: calc(var(--tabbar) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: color-mix(in srgb, var(--card) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid var(--line);
    z-index: 10;
  }
  nav button {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 12px;
    color: var(--muted);
  }
  nav button.active { color: var(--green); font-weight: 600; }
  .icon { font-size: 24px; transition: transform 0.2s; }
  nav button.active .icon { transform: scale(1.15) translateY(-1px); }
  .badge {
    position: absolute;
    top: 6px;
    left: calc(50% + 8px);
    min-width: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--amber);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 20px;
  }
</style>

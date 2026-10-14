<script lang="ts">
  import Courses from './views/Courses.svelte';
  import Stock from './views/Stock.svelte';
  import Recettes from './views/Recettes.svelte';
  import { db } from './lib/db';
  import { liveQuery } from 'dexie';

  type Tab = 'stock' | 'courses' | 'recettes';
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'stock', label: 'Stock', icon: '🧊' },
    { id: 'courses', label: 'Courses', icon: '🛒' },
    { id: 'recettes', label: 'Recettes', icon: '🍳' }
  ];

  const initial = location.hash.slice(1) as Tab;
  let tab = $state<Tab>(tabs.some((t) => t.id === initial) ? initial : 'courses');
  $effect(() => {
    history.replaceState(null, '', `#${tab}`);
  });

  const toBuy = liveQuery(() => db.shopping.filter((i) => !i.deleted && !i.checked).count());
</script>

<main>
  {#if tab === 'courses'}
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

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top) + 12px) 16px
      calc(var(--tabbar) + env(safe-area-inset-bottom) + 24px);
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

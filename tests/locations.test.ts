import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import {
  LOCATIONS,
  addLocation,
  deleteLocation,
  guessLocation,
  moveLocation,
  seedLocations,
  watchLocations
} from '../src/lib/locations.svelte';
import { addStock } from '../src/lib/stock';

const tick = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await seedLocations();
});

describe('emplacements configurables', () => {
  it('ajout, réordonnancement, suppression d’un emplacement vide uniquement', async () => {
    const sub = watchLocations();
    const cave = await addLocation('Cave', '🍷');
    await tick();
    expect(LOCATIONS.at(-1)?.label).toBe('Cave');
    await moveLocation(cave, -1);
    await tick();
    expect(LOCATIONS.at(-2)?.id).toBe(cave);
    await addStock('vin 1 l', cave);
    expect(await deleteLocation(cave)).toBe(1);
    expect(await deleteLocation('menager')).toBe(0);
    await tick();
    expect(LOCATIONS.some((l) => l.id === 'menager')).toBe(false);
    // rayon « ménager » sans emplacement dédié → premier emplacement
    expect(guessLocation('menager')).toBe(LOCATIONS[0].id);
    sub.unsubscribe();
  });
});

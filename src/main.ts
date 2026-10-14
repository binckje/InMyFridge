import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { requestPersistence } from './lib/db';
import { handleRedirect } from './lib/drive';
import { seedRecipes } from './lib/recipes';
import { seedLocations, watchLocations } from './lib/locations.svelte';
import { startAutoSync } from './lib/autosync';

// Retour de la connexion Google : à traiter avant que l'app lise le #onglet.
const pending = handleRedirect();

requestPersistence();
seedRecipes();
seedLocations().then(watchLocations);
if (!pending) startAutoSync();

export default mount(App, { target: document.getElementById('app')!, props: { pending } });

import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { requestPersistence } from './lib/db';
import { handleRedirect } from './lib/drive';

// Retour de la connexion Google : à traiter avant que l'app lise le #onglet.
const pending = handleRedirect();

requestPersistence();

export default mount(App, { target: document.getElementById('app')!, props: { pending } });

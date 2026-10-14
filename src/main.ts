import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { requestPersistence } from './lib/db';

requestPersistence();

export default mount(App, { target: document.getElementById('app')! });

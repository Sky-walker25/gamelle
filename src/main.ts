import './ui/styles.css';
import { App } from './ui/app';
import { MAPS } from './data/maps';
import { TOWERS } from './data/towers';
import { ENEMIES } from './data/enemies';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

const app = new App(root);
app.start();

declare global {
  interface Window {
    __gamelle: {
      app: App;
      maps: typeof MAPS;
      towers: typeof TOWERS;
      enemies: typeof ENEMIES;
    };
  }
}

// Debug and end-to-end test hook.
window.__gamelle = { app, maps: MAPS, towers: TOWERS, enemies: ENEMIES };

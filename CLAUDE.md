# Gamelle Defense — notes pour le développement

Tower defense historique en TypeScript + Canvas 2D, sans dépendance à l'exécution
ni asset externe. Lire `docs/ARCHITECTURE.md` avant de toucher au moteur.

## Commandes

- `npm run dev` : serveur de développement (Vite).
- `npm run check` : typecheck + lint + tests unitaires + build. À lancer avant tout commit.
- `npm run test:e2e` : Playwright (le serveur de prévisualisation démarre tout seul).
- `npm run format` : Prettier sur `src`, `tests`, `e2e`, `index.html`.

## Règles du projet

- La simulation (`src/sim`) ne touche jamais au DOM ni au Canvas et ne tire son
  aléatoire que de `world.rng`. Toute sortie passe par `world.events`.
- Le contenu (tours, ennemis, cartes) vit dans `src/data` avec des textes `{ fr, en }`
  et une note historique exacte : rien de fictif, tout doit avoir existé.
- Ajouter un ennemi impose une valeur dans `THREAT` (`src/sim/waves.ts`) ; ajouter
  une carte impose que le bot de `tests/balance.test.ts` la gagne en facile et en normal.
- Les chaînes d'interface passent par `t()` (`src/ui/i18n.ts`), jamais en dur.
- Pas de `console.log` dans `src` (ESLint) ; `console.warn`/`error` tolérés.

## Vérification visuelle

Chromium est disponible pour Playwright ; un script Node avec `chromium.launch()`
et `page.evaluate(() => window.__gamelle…)` permet de piloter le jeu et de prendre
des captures (`__gamelle.app.session.world` expose la simulation en cours).

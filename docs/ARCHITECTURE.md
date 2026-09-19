# Architecture

Gamelle Defense sépare strictement **la simulation** (pure, déterministe,
testable sans navigateur) du **rendu** et de **l'interface**.

```
src/
  core/      RNG à graine, maths, émetteur d'événements, boucle à pas fixe
  data/      contenu du jeu : tours, ennemis, cartes, difficultés
  sim/       moteur : grille, pathfinding, dégâts, vagues, World
  render/    Canvas 2D : terrain, sprites, particules, éclairage, caméra
  audio/     synthèse Web Audio : effets et musique générative
  meta/      persistance localStorage : réglages, progression, sauvegarde
  ui/        DOM : écrans, HUD, panneaux, i18n, contrôleur de partie
tests/       Vitest (moteur, données, vagues, équilibrage par bot)
e2e/         Playwright (parcours utilisateur dans Chromium)
```

## Simulation (`src/sim`)

- `World` est l'état complet d'une partie : or, vies, tours, ennemis,
  projectiles, pièges, file de spawn, phase de vague. `world.step(dt)` avance
  la simulation d'un pas ; la boucle de jeu appelle toujours des pas de
  `1/60 s`, quel que soit le rafraîchissement de l'écran, et la vitesse ×2/×3
  multiplie simplement le nombre de pas par image.
- Toute la randomisation passe par `world.rng` (mulberry32 à graine). Une
  partie sauvegardée puis restaurée reproduit exactement la même suite
  d'événements (voir `tests/world.test.ts`, « Persistence »).
- Les **événements** (`world.events`) sont la seule sortie de la simulation
  vers l'extérieur : `shoot`, `hit`, `explosion`, `enemyDied`, `waveStart`,
  `towerBuilt`, `gameOver`… Le rendu les transforme en particules, l'UI en
  sons et en messages. La simulation ne connaît ni le DOM ni le Canvas.
- `Grid` résout les cartes : les chemins fixes sont des polylignes en pixels
  monde ; les cartes ouvertes (`open: true`) utilisent un **champ de flux**
  (BFS depuis la base) que les ennemis descendent en gardant leur cap. Poser
  une tour marque la case occupée, recalcule le flux et réachemine chaque
  ennemi depuis sa position. `canBuild` refuse toute pose qui couperait la
  route d'un point d'apparition ou emprisonnerait un ennemi.
- `damage.ts` contient la formule de dégâts unique (armure, perce-armure,
  types, résistances, bonus anti-aérien, critiques) et la courbe de vie des
  ennemis selon la vague.
- `waves.ts` génère les vagues de façon déterministe à partir de la carte et
  du numéro de vague : budget de menace croissant, roster débloqué
  progressivement, « saveurs » (aérienne, ruée, lourde), boss toutes les dix
  vagues, montée continue en mode infini.

### Attaques

| `attack`     | Comportement |
| ------------ | ------------ |
| `projectile` | projectile à tête chercheuse, dégâts (ou zone) à l'impact |
| `hitscan`    | impact instantané avec traceur |
| `artillery`  | obus en cloche vers la position anticipée de la cible, dégâts de zone à l'atterrissage, portée minimale |
| `cone`       | touche tout ennemi dans un cône devant la tour |
| `salvo`      | N projectiles répartis sur N cibles distinctes |
| `aura`       | effet continu sur les ennemis à portée (ralentissement, dégâts, armure) |
| `trap`       | pose périodiquement des pièges sur les cases de chemin voisines |
| `support`    | renforce les tours à portée (dégâts, cadence, portée, or, révélation) ; ne se cumule pas |

## Rendu (`src/render`)

- `Renderer` gère la caméra, le pixel ratio, l'ordre de dessin, la météo, les
  secousses d'écran et, sur les cartes de nuit, une **lightmap** multipliée
  sur la scène.
- La **caméra** a un zoom (1 = carte entière) et un décalage, tous deux bornés
  pour qu'aucun vide n'apparaisse sur un côté. `setZoom` garde le point visé
  sous le doigt ou le curseur ; `zoomForTileSize` et `zoomToCoverHeight`
  servent à ouvrir les petits écrans à une taille de case jouable.
- `terrain.ts` dessine une fois le sol, les chemins, l'eau ou la boue, les
  rochers, arbres, ruines, portes et forteresses dans un canvas hors écran,
  réutilisé chaque image.
- `towers.ts` et `enemies.ts` dessinent chaque sprite en vectoriel à partir
  de primitives (`primitives.ts`). Une tour se compose d'une plateforme et
  d'une partie orientable selon `tower.angle` ; `fireAnim` anime le recul.
- `particles.ts` gère explosions, fumées, étincelles, flammes, anneaux, textes
  de dégâts et pièces d'or, avec un plafond global et une densité réduite en
  mode « animations réduites ».
- `theme.ts` définit la palette de chaque ambiance (`sunny`, `green`,
  `dusk`, `rain`, `night`, `snow`).

## Interface (`src/ui`)

- `App` orchestre les écrans (menu, cartes, encyclopédie, jeu) et les modales
  (pause, réglages, fin de partie). Il possède les réglages et la progression.
- `GameSession` possède une partie en cours : `World`, `Renderer`,
  `GameLoop`, HUD, panneaux latéraux, entrées souris/clavier/tactile,
  sons, sauvegarde automatique.
- **Entrées** : un seul jeu de gestionnaires `pointer*` couvre souris et
  tactile. Deux doigts pincent (zoom autour du milieu), un doigt fait défiler
  la carte quand elle est zoomée. À la souris un clic construit directement ;
  au doigt un appui ne fait que **viser** et une barre de confirmation
  apparaît, ce qui évite les poses accidentelles.
- **Disposition** : la feuille CSS donne la priorité au terrain sur petit
  écran. Les panneaux deviennent une barre défilante et une feuille glissante
  posées par-dessus la carte plutôt qu'à côté. Les garde-fous sont testés dans
  `e2e/mobile.spec.ts` (part de l'écran occupée par la carte, taille des
  cibles tactiles, absence de défilement horizontal).
- `i18n.ts` contient les chaînes FR/EN ; les données du jeu portent leurs
  propres textes localisés (`{ fr, en }`) lus via `L()`.
- `meta/storage.ts` persiste réglages, étoiles, records et partie en cours
  dans `localStorage`, avec repli silencieux si le stockage est indisponible.

## Éditeur de cartes (`src/ui/editor`, `src/ui/screens/editor.ts`)

- `editor/model.ts` est un modèle pur : état immuable, outils (`paint`,
  `addWaypoint` avec insertion d'angles droits, `resize`, `setOpen`…),
  `validate` (chemins sur cases constructibles, base atteignable via le champ de
  flux) et `toMapDef` qui produit une `MapDef` jouable identique aux cartes de
  la campagne. Tout est testé sans DOM dans `tests/editor.test.ts`.
- L'écran rend le vrai terrain (`renderTerrain`) à chaque modification, puis
  superpose la grille, les points de passage et le survol.
- L'or de départ n'a volontairement pas de plafond : l'éditeur est un bac à
  sable. Les vies (1 à 200) et les vagues (5 à 100) restent bornées parce que
  le générateur de vagues et l'affichage s'appuient dessus.
- Les cartes sont stockées dans `localStorage` (`meta/storage.ts`, préfixe
  `custom-`) et retrouvées par `findMap`, y compris pour reprendre une partie
  sauvegardée dessus.

## Ajouter du contenu

**Une tour** : ajouter une ligne dans `src/data/towers.ts` (trois niveaux plus
deux spécialisations, textes FR/EN, note historique), puis un cas de dessin
dans `src/render/towers.ts`. Les tests de données vérifient la cohérence des
coûts et des textes.

**Un ennemi** : ajouter une entrée dans `src/data/enemies.ts`, un cas de
dessin dans `src/render/enemies.ts`, une valeur de menace dans `THREAT`
(`src/sim/waves.ts`) et l'inscrire dans le `roster` des cartes concernées.

**Une carte** : ajouter une entrée dans `src/data/maps.ts` : grille ASCII
(`.` constructible, `#` rocher, `T` arbre, `~` eau ou boue, `x` ruine),
chemins par points de passage alignés, thème, roster avec vague
d'apparition, tours débloquées. Les tests vérifient que les chemins ne
traversent que des cases constructibles et que le bot d'équilibrage gagne
en facile et en normal.

## Tests

- `tests/` : RNG, maths, données, générateur de vagues, formule de dégâts,
  `World` (économie, construction, ciblage, statuts, cartes ouvertes,
  persistance) et équilibrage par bot.
- `e2e/` : menu, langue, déblocage des cartes, construction, vague,
  victoire, défaite, sauvegarde et reprise, encyclopédie, raccourcis.

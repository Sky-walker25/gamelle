# Gamelle Defense

Un jeu de *tower defense* historique, jouable directement dans le navigateur.
Neuf lignes de tours et seize types d'ennemis qui traversent trente siècles
d'art de la guerre, six champs de bataille réels, et **rien de fictif** : chaque
arme, chaque troupe et chaque carte correspond à quelque chose qui a existé.

Le jeu est écrit en TypeScript, rendu en Canvas 2D et n'embarque **aucun
asset externe** : les graphismes sont dessinés en vectoriel par le moteur et
les sons sont synthétisés en Web Audio. Le build final est un site statique
qui fonctionne hors ligne une fois chargé.

## Jouer

- **En ligne** : la branche `main` est déployée automatiquement sur GitHub Pages
  (`https://<propriétaire>.github.io/gamelle/`).
- **En local** :

```bash
npm install
npm run dev        # serveur de développement sur http://localhost:5173
npm run build      # build de production dans dist/
npm run preview    # sert dist/ sur http://localhost:4173
```

Node 20 ou plus récent est requis.

## Règles du jeu

- Les ennemis suivent le chemin jusqu'à votre forteresse ; chaque ennemi qui
  passe vous coûte des vies. À zéro vie, la partie est perdue.
- Construisez des tours sur les cases libres avec l'or gagné en éliminant
  des ennemis et en repoussant des vagues. Une tour se revend à 70 % de son coût.
- Chaque tour a trois niveaux, puis un choix entre deux **spécialisations**
  au niveau final. Monter de niveau fait souvent changer d'époque : les
  archers deviennent arbalétriers, puis mousquetaires, puis mitrailleuse
  Gatling ou fusiliers Lebel.
- Les tours ont un **mode de ciblage** : premier, dernier, plus fort, plus
  faible, plus proche.
- **Dégâts** : les tirs perforants sont réduits par l'armure, les explosifs
  à moitié, le feu l'ignore. Certains ennemis résistent ou sont vulnérables
  à un type précis.
- Les ennemis **volants** ne sont touchés que par certaines tours (archers,
  baliste, fusées, canon à eau). Les ennemis **camouflés** ne sont vus qu'à
  moitié portée, sauf à proximité d'un poste radar.
- Une **campagne** compte 30 vagues avec un boss toutes les dix. Vous pouvez
  appeler la vague suivante en avance pour un bonus d'or, et même lancer
  plusieurs vagues en même temps.
- Gagner une carte débloque la suivante et de nouvelles tours ; la difficulté
  donne 1, 2 ou 3 étoiles. Le **mode infini** se débloque sur chaque carte
  gagnée.
- **Verdun** est un terrain ouvert : il n'y a pas de chemin tracé, vos tours
  forment le labyrinthe. Il est interdit de fermer complètement le passage.

### Raccourcis clavier

| Touche | Action |
| --- | --- |
| `1` à `9` | Choisir une tour à construire |
| `Échap` / clic droit | Annuler, désélectionner |
| `N` / `Entrée` | Vague suivante |
| `Espace` | Pause |
| `+` / `-` | Vitesse ×1, ×2, ×3 |
| `U` | Améliorer la tour sélectionnée |
| `S` | Vendre la tour sélectionnée |
| `T` | Changer le mode de ciblage |
| `R` | Afficher toutes les portées |
| `Maj` + clic | Construire plusieurs tours d'affilée |

Le jeu est aussi jouable au tactile.

## Contenu

**Tours** : Archers, Baliste, Canon, Artillerie de siège, Feu grégeois,
Sapeurs, Lance-fusées, Pièges, Commandement. Chaque ligne va de l'Antiquité
ou du Moyen Âge au XXe siècle (baliste → couleuvrine → canon antichar →
Flak 88 ou fusil Boys ; hwacha → fusées Congreve → Katioucha → Nebelwerfer
ou BM-21 Grad, etc.).

**Ennemis** : légionnaire, conscrit, hussard, chevalier, hoplite, berserker,
shinobi, médecin de campagne, montgolfière, biplan, camion de troupes,
éléphant de guerre, char Renault FT, et trois boss : Surus (l'éléphant
d'Hannibal), le Zeppelin L 30 et le char Mark IV.

**Champs de bataille** : Thermopyles (480 av. J.-C.), Alésia (52 av. J.-C.),
Hastings (1066), Azincourt (1415), Verdun (1916), Stalingrad (1942).

L'encyclopédie intégrée donne pour chaque élément sa date, son origine et une
note historique. L'interface est en français, avec une traduction anglaise.

## Développement

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Vitest : moteur, données, générateur de vagues, équilibrage
npm run test:e2e     # Playwright : parcours complets dans Chromium
npm run check        # tout d'un coup, plus le build
```

Les tests d'équilibrage (`tests/balance.test.ts`) font jouer un bot volontairement
naïf sur chaque carte : il doit gagner en facile et en normal. C'est le
garde-fou qui empêche un changement de données de rendre une carte injouable.

L'organisation du code est décrite dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
qui explique aussi comment ajouter une tour, un ennemi ou une carte.

## Intégration continue

- `.github/workflows/ci.yml` : typecheck, lint, format, tests unitaires,
  build, puis tests Playwright.
- `.github/workflows/deploy.yml` : à chaque push sur `main`, build avec le
  bon chemin de base et déploiement sur GitHub Pages. Activez *Settings →
  Pages → Source : GitHub Actions* sur le dépôt.

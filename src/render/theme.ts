import type { ThemeId } from '@/sim/types';

export interface Theme {
  id: ThemeId;
  ground: [string, string, string];
  tuft: string;
  path: string;
  pathEdge: string;
  pathDetail: string;
  water: string;
  waterDeep: string;
  shore: string;
  waterKind: 'water' | 'mud';
  rock: string;
  rockDark: string;
  rockLight: string;
  tree: string;
  treeDark: string;
  trunk: string;
  ruin: string;
  ruinDark: string;
  /** Screen-space colour overlay applied over the whole scene. */
  overlay: { color: string; alpha: number; blend: GlobalCompositeOperation };
  weather: 'none' | 'rain' | 'snow' | 'embers' | 'leaves';
  night: boolean;
  /** Ambient light colour used by the night lightmap. */
  ambient: string;
  snowCaps: boolean;
  label: string;
  /** Colour of the letterbox area around the map. */
  edge: string;
}

const THEMES: Record<ThemeId, Theme> = {
  sunny: {
    id: 'sunny',
    ground: ['#b7a86a', '#c2b374', '#ab9c60'],
    tuft: '#8f8a4c',
    path: '#d5c79a',
    pathEdge: '#b6a67a',
    pathDetail: '#c3b283',
    water: '#3e8fb0',
    waterDeep: '#2c6f8f',
    shore: '#d9cf9c',
    waterKind: 'water',
    rock: '#9c8f7a',
    rockDark: '#6f655a',
    rockLight: '#c4b8a1',
    tree: '#5f7a3a',
    treeDark: '#3f5626',
    trunk: '#6d4c2a',
    ruin: '#c9c0aa',
    ruinDark: '#8d8474',
    overlay: { color: '#ffe9b0', alpha: 0.08, blend: 'overlay' },
    weather: 'none',
    night: false,
    ambient: '#ffffff',
    snowCaps: false,
    label: 'Grèce',
    edge: '#2a2618',
  },
  green: {
    id: 'green',
    ground: ['#6f9a45', '#7aa54f', '#658d3e'],
    tuft: '#4f7a30',
    path: '#b48e5e',
    pathEdge: '#8e6d45',
    pathDetail: '#a37f52',
    water: '#3f7fa8',
    waterDeep: '#2d5f82',
    shore: '#9fb56b',
    waterKind: 'water',
    rock: '#8c8c82',
    rockDark: '#5d5d55',
    rockLight: '#b5b5aa',
    tree: '#3e7a34',
    treeDark: '#28531f',
    trunk: '#5b3d22',
    ruin: '#b9b5a6',
    ruinDark: '#7e7a6c',
    overlay: { color: '#000000', alpha: 0, blend: 'source-over' },
    weather: 'leaves',
    night: false,
    ambient: '#ffffff',
    snowCaps: false,
    label: 'Gaule',
    edge: '#161d12',
  },
  dusk: {
    id: 'dusk',
    ground: ['#8a8a4a', '#969552', '#7e7d42'],
    tuft: '#676630',
    path: '#a88a62',
    pathEdge: '#846947',
    pathDetail: '#987b55',
    water: '#4a6f8f',
    waterDeep: '#34536e',
    shore: '#a5a36a',
    waterKind: 'water',
    rock: '#8a7f72',
    rockDark: '#5c544a',
    rockLight: '#b3a795',
    tree: '#4c6a2e',
    treeDark: '#30471c',
    trunk: '#4f3620',
    ruin: '#b5ab97',
    ruinDark: '#7b7361',
    overlay: { color: '#ff8c3a', alpha: 0.16, blend: 'multiply' },
    weather: 'none',
    night: false,
    ambient: '#ffffff',
    snowCaps: false,
    label: 'Angleterre',
    edge: '#1e1c12',
  },
  rain: {
    id: 'rain',
    ground: ['#6c7b45', '#75844c', '#62713e'],
    tuft: '#4d5d2f',
    path: '#6f5a3f',
    pathEdge: '#54432f',
    pathDetail: '#7d6647',
    water: '#5a4a34',
    waterDeep: '#463a29',
    shore: '#6a5d40',
    waterKind: 'mud',
    rock: '#7d7d75',
    rockDark: '#52524c',
    rockLight: '#a3a39a',
    tree: '#3c6030',
    treeDark: '#28421f',
    trunk: '#4c341f',
    ruin: '#a9a495',
    ruinDark: '#6f6b5f',
    overlay: { color: '#5b6d86', alpha: 0.22, blend: 'multiply' },
    weather: 'rain',
    night: false,
    ambient: '#ffffff',
    snowCaps: false,
    label: 'France',
    edge: '#151a13',
  },
  night: {
    id: 'night',
    ground: ['#6a5d48', '#736550', '#5d5140'],
    tuft: '#4d4232',
    path: '#5a4d3c',
    pathEdge: '#453a2c',
    pathDetail: '#6b5c48',
    water: '#3b3a33',
    waterDeep: '#2b2a25',
    shore: '#5c5240',
    waterKind: 'mud',
    rock: '#5f5a52',
    rockDark: '#3d3a35',
    rockLight: '#85807a',
    tree: '#3b3a30',
    treeDark: '#25251d',
    trunk: '#332619',
    ruin: '#8a8375',
    ruinDark: '#57524a',
    overlay: { color: '#101a3a', alpha: 0.5, blend: 'multiply' },
    weather: 'embers',
    night: true,
    ambient: '#7b86a8',
    snowCaps: false,
    label: 'France',
    edge: '#0b0d14',
  },
  snow: {
    id: 'snow',
    ground: ['#d9dde3', '#e4e7ec', '#cfd4dc'],
    tuft: '#b9bec8',
    path: '#8f8f93',
    pathEdge: '#6e6e73',
    pathDetail: '#a3a3a8',
    water: '#7f9bb4',
    waterDeep: '#5f7a93',
    shore: '#c8d1dc',
    waterKind: 'water',
    rock: '#8c8c90',
    rockDark: '#5e5e63',
    rockLight: '#c4c4c9',
    tree: '#4d6650',
    treeDark: '#344739',
    trunk: '#4a3a2c',
    ruin: '#8d7f72',
    ruinDark: '#5e544a',
    overlay: { color: '#a9c0e0', alpha: 0.14, blend: 'multiply' },
    weather: 'snow',
    night: false,
    ambient: '#ffffff',
    snowCaps: true,
    label: 'URSS',
    edge: '#171a20',
  },
};

export function theme(id: ThemeId): Theme {
  return THEMES[id];
}

/** Colours shared by sprites regardless of theme. */
export const PALETTE = {
  wood: '#8a5a2b',
  woodDark: '#5e3c1c',
  woodLight: '#b07a41',
  stone: '#9a9a98',
  stoneDark: '#666664',
  stoneLight: '#c6c6c3',
  bronze: '#b3853a',
  bronzeDark: '#7c5a22',
  iron: '#6d7378',
  ironDark: '#3f4347',
  ironLight: '#a2a8ad',
  olive: '#6b6f3a',
  oliveDark: '#4a4d27',
  fieldGrey: '#6f7377',
  navy: '#2b3d6b',
  red: '#b2332f',
  redDark: '#7a1f1c',
  gold: '#e3b53c',
  goldDark: '#a07d1f',
  white: '#f2f2f0',
  black: '#1c1c1c',
  sand: '#d3c193',
  sandDark: '#a89a72',
  skin: '#e2b48c',
  shadow: 'rgba(0,0,0,0.28)',
  fire: '#ff9a2a',
  fireCore: '#fff2a8',
  smoke: 'rgba(80,80,80,0.5)',
  frost: '#9fd6ff',
  poison: '#88c057',
  green: '#3e9b3e',
  blue: '#3a7bd5',
} as const;

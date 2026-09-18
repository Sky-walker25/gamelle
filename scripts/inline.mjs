// Builds a single self-contained HTML file from the Vite output (dist/), so the game
// can be opened directly from disk or hosted anywhere as one file.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
let out = html;
out = out.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_m, src) => {
  const js = readFileSync(join(dist, src.replace(/^\.?\//, '')), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
out = out.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_m, href) => {
  const css = readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8');
  return `<style>${css}</style>`;
});
// The manifest and service worker only make sense on a real origin.
out = out.replace(/<link rel="manifest"[^>]*>\s*/g, '');
out = out.replace(/<link rel="icon"[^>]*>/, '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2712%27 fill=%27%231c2230%27/%3E%3Crect x=%2714%27 y=%2726%27 width=%2736%27 height=%2726%27 fill=%27%239a9a98%27/%3E%3Cpath d=%27M33 6 L46 11 L33 16 Z%27 fill=%27%23b2332f%27/%3E%3C/svg%3E" />');
const target = process.argv[2] ?? join(dist, 'gamelle-defense.html');
const dir = target.slice(0, target.lastIndexOf('/'));
if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(target, out);
console.log(`${target}: ${(out.length / 1024).toFixed(0)} kB`);

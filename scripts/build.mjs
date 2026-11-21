// Kopierer Supabase-biblioteket og skriftene inn i www/, så appen virker uten nett og uten CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const www = (p) => join(root, 'www', p);

const files = [
  [nm('@supabase/supabase-js/dist/umd/supabase.js'), www('vendor/supabase.js')],
  [nm('leaflet/dist/leaflet.js'), www('vendor/leaflet.js')],
  [nm('leaflet/dist/leaflet.css'), www('vendor/leaflet.css')],
  [nm('@fontsource/figtree/files/figtree-latin-400-normal.woff2'), www('fonts/figtree-400.woff2')],
  [nm('@fontsource/figtree/files/figtree-latin-600-normal.woff2'), www('fonts/figtree-600.woff2')],
  [nm('@fontsource/figtree/files/figtree-latin-700-normal.woff2'), www('fonts/figtree-700.woff2')],
  [nm('@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2'), www('fonts/bricolage-700.woff2')],
  [nm('@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2'), www('fonts/bricolage-800.woff2')]
];

for (const [from, to] of files) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(`Bygget: ${files.length} filer kopiert til www/`);

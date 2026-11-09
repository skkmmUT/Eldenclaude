/**
 * Builds the game into ONE self-contained HTML file (scripts, styles and fonts inlined)
 * that opens straight from disk — for sharing a playable build without a server.
 *
 *   npm run build:single   →   dist-single/throne-of-the-abyss.html
 */
import { build } from 'vite';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'dist-single', '.tmp');
const outFile = path.join(root, 'dist-single', 'throne-of-the-abyss.html');
rmSync(path.join(root, 'dist-single'), { recursive: true, force: true });
process.env.SINGLE_FILE = '1';

await build({
  root,
  logLevel: 'warn',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    assetsInlineLimit: () => true, // fonts become data: URIs inside the CSS
    modulePreload: false,
    cssCodeSplit: false,
  },
});

const assets = path.join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
if (js.length !== 1) throw new Error(`expected one script chunk, got ${js.join(', ')}`);
let css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(path.join(assets, f), 'utf8')).join('\n');
// Every browser that runs WebGL2 reads woff2: drop the duplicate .woff fallbacks.
css = css.replace(/,\s*url\(data:font\/woff;base64,[^)]*\)\s*format\(["']woff["']\)/g, '');
const script = readFileSync(path.join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

let html = readFileSync(path.join(tmp, 'index.html'), 'utf8');
html = html.replace(/\s*<script type="module"[^>]*><\/script>/, '');
html = html.replace(/\s*<link rel="stylesheet"[^>]*>/g, '');
// Function replacers: the bundle contains `$&`/`$'` sequences that string replacements would expand.
html = html.replace('</head>', () => `  <style>\n${css}\n</style>\n  </head>`);
html = html.replace('</body>', () => `  <script type="module">\n${script}\n</script>\n  </body>`);

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
rmSync(tmp, { recursive: true, force: true });
console.log(`${path.relative(root, outFile)}  ${(html.length / 1024 / 1024).toFixed(2)} MB`);

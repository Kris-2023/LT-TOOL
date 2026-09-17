import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDirectory);
const indexPath = join(projectRoot, 'index.html');

const assets = [
  { name: 'furniture-calculator.css', indent: '        ' },
  { name: 'furniture-calculator.js', indent: '    ' },
  { name: 'furniture-calculator-ui.js', indent: '    ' },
];

let html = readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

for (const asset of assets) {
  const begin = `${asset.indent}/* BEGIN INLINE ${asset.name} */`;
  const end = `${asset.indent}/* END INLINE ${asset.name} */`;
  const startIndex = html.indexOf(begin);
  const endIndex = html.indexOf(end, startIndex + begin.length);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing inline markers for ${asset.name}`);
  }

  const source = readFileSync(join(projectRoot, asset.name), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd()
    .split('\n')
    .map((line) => line ? `${asset.indent}${line}` : '')
    .join('\n');

  html = `${html.slice(0, startIndex + begin.length)}\n${source}\n${html.slice(endIndex)}`;
}

writeFileSync(indexPath, html, 'utf8');
console.log('Synced LT-TOOL inline CSS and JavaScript assets into index.html.');

import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const original = await readFile(new URL('index.html', root), 'utf8');
const backendTag = /^\s*<meta name="club-backend" [^>]+>\r?\n/m;
if (!backendTag.test(original)) throw new Error('Missing club-backend meta tag in index.html');
const html = original.replace(backendTag, '');

await mkdir(output, {recursive: true});
await Promise.all([
  cp(new URL('public/', root), new URL('public/', output), {recursive: true}),
  writeFile(new URL('index.html', output), html),
]);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

test('service worker precaches every app file', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of listed) assert.ok(existsSync(join(root, f)), `listed but missing: ${f}`);
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
  const actual = [...walk('js'), ...walk('css'), ...walk('icons'), 'index.html', 'manifest.json'];
  for (const f of actual) assert.ok(listed.includes(f), `not precached: ${f}`);
});

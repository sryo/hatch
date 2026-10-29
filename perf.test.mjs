import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { GLYPHS, url, css } from './hatch.js';
import { raster } from './raster.mjs';

// Budgets: optimize to meet them, don't raise them.

test('a glyph url carries little more than its path', () => {
  // Only what a data URI needs escaping is escaped, and the SVG holds nothing a mask doesn't read.
  for (const g of GLYPHS) {
    const extra = url(g).length - g.d.length;
    assert.ok(extra <= 110, `${g.name}: ${extra} B around a ${g.d.length} B path`);
  }
});

test('the stylesheet stays small', () => {
  const sheet = css(), gz = gzipSync(sheet, { level: 9 }).length;
  // Most of what's left gzipped is path data, which doesn't compress.
  assert.ok(sheet.length <= 3300, `${sheet.length} B`);
  assert.ok(gz <= 920, `${gz} B gzipped`);
});

test('rasterizing is fast', () => {
  // Every glyph at 256 px across, as the slowest tests do, in well under a frame per glyph. The best of five runs,
  // so a busy machine doesn't fail it.
  raster(GLYPHS[0].d, 64);
  let ms = Infinity;
  for (let run = 0; run < 5; run++) {
    const t = performance.now();
    for (const g of GLYPHS) raster(g.d, 256);
    ms = Math.min(ms, performance.now() - t);
  }
  assert.ok(ms <= 8, `${ms.toFixed(1)} ms for ${GLYPHS.length} glyphs`);
});

test('the shipped scripts stay small', () => {
  // Comments ship with the source, so they keep to what the code can't say.
  for (const [f, max] of [['hatch.js', 5050], ['shade.js', 3050]]) {
    const n = readFileSync(new URL(f, import.meta.url)).length;
    assert.ok(n <= max, `${f}: ${n} B`);
  }
});

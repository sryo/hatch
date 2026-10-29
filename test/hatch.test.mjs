import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cover, raster, device, similar, seams } from './raster.mjs';
import { shade, ramp } from '../shade.js';
import { GLYPHS, INK, glyph, name, svg, url, pattern, mask, ink, keyed, css } from '../hatch.js';

// Color math: sRGB, OKLab/OKLCH and compositing. Colors are [r, g, b] in 0–1 sRGB.
// Out-of-gamut results are clipped per channel, as Chrome does.

const lin = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const gam = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
const clip = v => Math.min(1, Math.max(0, v));

function oklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function rgb([L, C, H]) {
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3;
  const m = (L - .1055613458 * A - .0638541728 * B) ** 3;
  const s = (L - .0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s,
  ].map(v => clip(gam(clip(v))));
}

// color-mix(in srgb, a p, b) for opaque colors; also how a translucent fill composites over its surface.
const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));

// The ink hatch's CSS works out for a fill, mirrored here so tests can measure it.
function inkOf(fill, { mid = INK.mid, step = INK.step } = {}) {
  const [L, C, H] = oklch(fill), m = +(mid - 1e-6).toFixed(6);
  return rgb([L - Math.min(1, Math.max(-1, (L - m) * 1e9)) * step, C, H]);
}

// OKLab distance, for how far one color moves from another.
const distance = (a, b) => {
  const [p, q] = [a, b].map(c => { const [L, C, H] = oklch(c); return [L, C * Math.cos(H), C * Math.sin(H)]; });
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

test('glyph names are unique', () => {
  assert.equal(new Set(GLYPHS.map(g => g.name)).size, GLYPHS.length);
});

test('positions wrap both ways', () => {
  assert.equal(name(0), GLYPHS[0].name);
  assert.equal(name(GLYPHS.length), GLYPHS[0].name);
  assert.equal(name(-1), GLYPHS.at(-1).name);
  assert.equal(glyph('dots'), GLYPHS.find(g => g.name === 'dots'));
  assert.throws(() => glyph('nope'), RangeError);
  for (const bad of [null, undefined, 1.5, NaN, Infinity, {}, { d: 4 }, true]) assert.throws(() => glyph(bad), RangeError, String(bad));
  const own = { name: 'mine', d: 'M0 0h4v4H0z' };
  assert.equal(glyph(own), own);
});

test('a key keeps its glyph', () => {
  const pick = keyed();
  assert.equal(pick('google'), GLYPHS[0].name);
  assert.equal(pick('direct'), GLYPHS[1].name);
  assert.equal(pick('google'), GLYPHS[0].name);
  const short = keyed(['dots', 'rows']);
  assert.deepEqual(['a', 'b', 'c'].map(short), ['dots', 'rows', 'dots']);
  assert.throws(() => keyed([]), RangeError);
});

test('every glyph inks about a fifth of its tile', () => {
  for (const g of GLYPHS) {
    const c = cover(g.d);
    assert.ok(c >= .17 && c <= .22, `${g.name}: ${(c * 100).toFixed(1)}%`);
  }
});

test('tiles meet without a seam', () => {
  for (const g of GLYPHS) {
    const { seam, inside } = seams(raster(g.d, 128), 128);
    assert.ok(seam[0] <= inside[0] && seam[1] <= inside[1], `${g.name}: ${seam} across the seams, at most ${inside} inside`);
  }
});

test('glyphs draw fully inked pixels', () => {
  // A glyph whose strokes straddle pixels never reaches full ink (about .75 at best), which costs it contrast against
  // the fill. A thin curve can't fill a whole pixel either, so the bar for every glyph sits at .9.
  for (const g of GLYPHS) assert.ok(Math.max(...device(g.d, 16)) >= .9, `${g.name} at 2×`);
  for (const n of ['rows', 'cols', 'squares']) assert.ok(Math.max(...device(glyph(n).d, 8)) >= .95, `${n} at 1×`);
});

test('straight glyphs have crisp edges at 2×', () => {
  for (const n of ['rows', 'cols', 'squares']) {
    const soft = device(glyph(n).d, 16).filter(v => v > .01 && v < .99);
    assert.equal(soft.length, 0, `${n}: ${soft.length} partly inked pixels`);
  }
});

test('neighbors in the order look different, wrapping around', () => {
  for (let i = 0; i < GLYPHS.length; i++) {
    const [a, b] = [GLYPHS[i], GLYPHS[(i + 1) % GLYPHS.length]], s = similar(a.d, b.d);
    assert.ok(s < .5, `${a.name}/${b.name}: ${s.toFixed(2)}`);
  }
});

// Fills across sRGB: hues every 20°, chroma 0–.2, lightness .08–.96, kept where in gamut.
const grid = [];
for (let h = 0; h < 360; h += 20) for (const C of [0, .04, .08, .12, .16, .2]) for (let L = .08; L <= .96; L += .01) {
  const c = rgb([L, C, h * Math.PI / 180]), [l2, c2] = oklch(c);
  if (Math.abs(l2 - L) < .005 && Math.abs(c2 - C) < .005) grid.push(c);
}

test('the glyph keeps the fill\'s color', () => {
  // Seen from a distance a hatched fill averages to the fill plus the glyph's cover of its ink. That average must stay
  // close to the fill and keep most of its chroma, so a hatched fill doesn't read paler or grayer than its hue.
  const most = Math.max(...GLYPHS.map(g => cover(g.d, 512)));
  let moved = 0, kept = 1;
  for (const f of grid) {
    const seen = mix(inkOf(f), f, most * .85), c = oklch(f)[1];
    moved = Math.max(moved, distance(seen, f));
    if (c > .04) kept = Math.min(kept, oklch(seen)[1] / c);
  }
  assert.ok(moved <= .1, `moves the fill by up to ${moved.toFixed(3)}`);
  assert.ok(kept >= .65, `keeps ${(kept * 100).toFixed(0)}% of the fill's chroma`);
});

test('a fill at the ink midpoint gets a full step darker', () => {
  const at = rgb([INK.mid, 0, 0]), [l] = oklch(at), [li] = oklch(inkOf(at));
  assert.ok(li < l && Math.abs(l - li - INK.step) < .02, `${l.toFixed(3)} → ${li.toFixed(3)}`);
});

test('css, svg and url carry every glyph', () => {
  const sheet = css();
  for (const g of GLYPHS) {
    assert.ok(sheet.includes(`.hatch-${g.name}{--hatch-g:url("data:image/svg+xml,<svg `), g.name);
    assert.ok(svg(g.name).includes(g.d));
    assert.ok(decodeURIComponent(url(g.name)).includes(g.d));
  }
  assert.ok(css({ prefix: 'cb' }).startsWith(':where(.cb,.cb-diag,'));
  for (const bad of ['', '1x', 'a b', 'x{}', '-a']) assert.throws(() => css({ prefix: bad }), RangeError, bad);
  assert.ok(sheet.includes('-webkit-mask:') && sheet.includes('@media (forced-colors:active)'));
});

test('a bare hatch class masks everything out', () => {
  assert.equal(css().match(/var\(--hatch-g,linear-gradient\(#0000,#0000\)\)/g)?.length, 2);
});

test('pattern, mask and ink write the expected markup', () => {
  assert.match(pattern('dots', { size: 6 }), /^<pattern id="hatch-dots" patternUnits="userSpaceOnUse" width="6" height="6"><path fill="#000" transform="scale\(0\.75\)"/);
  assert.match(mask('dots'), /<path fill="#fff"[^>]*><\/pattern><mask id="hatch-dots-mask"><rect [^>]*fill="url\(#hatch-dots-mask-p\)"\/><\/mask>$/);
  assert.equal(ink('red'), 'oklch(from red calc(l - clamp(-1,(l - .599999)*1e9,1)*.4) c h)');
});

test('default ids never collide', () => {
  const ids = [pattern('dots'), mask('dots'), pattern(shade('dots', .7)), mask(shade('dots', .7)), pattern(shade('dots', .3))]
    .flatMap(m => [...m.matchAll(/ id="([^"]+)"/g)].map(x => x[1]));
  assert.equal(new Set(ids).size, ids.length, ids.join(' '));
});

test('hatch.css is built from css()', () => {
  assert.equal(readFileSync(new URL('../hatch.css', import.meta.url), 'utf8'), css() + '\n', 'run npm run build');
});

test('shades ink the cover asked for and tile without a seam', () => {
  assert.ok(svg(shade('dots', .7)).includes('fill-rule="evenodd" d="M0 0h8v8H0z'));
  const n = 96;
  for (const g of GLYPHS) for (const w of [.05, .15, .3, .45, .55, .7, .85, .95]) {
    const s = shade(g.name, w), px = raster(s, n), c = px.reduce((a, b) => a + b, 0) / n / n;
    assert.ok(Math.abs(c - w) < .02, `${g.name} at ${w}: inks ${c.toFixed(3)}`);
    // Shade coordinates are rounded to 3 decimals, which can move an edge across one more pixel at the seam.
    const { seam, inside } = seams(px, n);
    assert.ok(seam[0] <= inside[0] + 1 && seam[1] <= inside[1] + 1, `${g.name} at ${w}: ${seam} across the seams, ${inside} inside`);
  }
});

test('a shade covers nothing at 0 and everything at 1', () => {
  for (const g of GLYPHS) {
    assert.equal(cover(shade(g.name, 0)), 0, `${g.name} at 0`);
    assert.equal(cover(shade(g.name, 1)), 1, `${g.name} at 1`);
  }
});

test('shade rejects what it has no shape or cover for', () => {
  for (const w of [NaN, Infinity, -Infinity, undefined, -.1, 1.1]) assert.throws(() => shade('dots', w), RangeError, String(w));
  assert.throws(() => shade({ name: 'mine', d: 'M0 0h4v4H0z' }, .5), RangeError);
  assert.throws(() => shade({ name: 'constructor', d: '' }, .5), RangeError);
  assert.throws(() => shade('nope', .5), RangeError);
});

test('rings stay rings at every cover', () => {
  for (let w = .05; w < .96; w += .05) {
    const r = shade('rings', w), d = shade('dots', w), s = similar(r, d);
    assert.notEqual(r.d, d.d, `at ${w.toFixed(2)}`);
    assert.ok(s < .9, `at ${w.toFixed(2)}: ${s.toFixed(2)} alike`);
  }
});

test('a ramp runs light to heavy', () => {
  assert.deepEqual(ramp(1), [.1]);
  const r = ramp(4);
  assert.equal(r.length, 4);
  assert.ok(r.every((v, i) => !i || v > r[i - 1]) && r[0] === .1 && Math.abs(r[3] - .85) < 1e-9);
});

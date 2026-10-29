export const TILE = 8;

export const GLYPHS = [
  { name: 'diag', d: 'M0 7.22 7.22 0H8v.78L.78 8H0zM0 0h.78L0 .78zM8 7.22V8h-.78z' },
  { name: 'dots', d: 'M.6 2a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0zm4 4a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0z' },
  { name: 'back', d: 'M0 0h.78L8 7.22V8h-.78L0 .78zM0 7.22.78 8H0zM7.22 0H8v.78z' },
  { name: 'squiggle', d: 'M-.5 4a2.5 2.5 0 0 1 5 0h-1a1.5 1.5 0 0 0-3 0zm8 0a2.5 2.5 0 0 1 5 0h-1a1.5 1.5 0 0 0-3 0zm-4 0a2.5 2.5 0 0 0 5 0h-1a1.5 1.5 0 0 1-3 0zm-8 0a2.5 2.5 0 0 0 5 0h-1a1.5 1.5 0 0 1-3 0z' },
  { name: 'grid', d: 'M0 0h8v.82H0zM0 .82h.82V8H0z' },
  { name: 'zigzag', d: 'M4.75 0 1.25 4l3.5 4h1.5l-3.5-4 3.5-4z' },
  { name: 'squares', d: 'M2 2h3.5v3.5H2z' },
  { name: 'rings', d: 'M0 2a2 2 0 1 0 4 0a2 2 0 1 0-4 0zM.58 2a1.42 1.42 0 1 1 2.84 0a1.42 1.42 0 1 1-2.84 0zM4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0zM4.58 6a1.42 1.42 0 1 1 2.84 0a1.42 1.42 0 1 1-2.84 0z' },
  { name: 'rows', d: 'M0 3h8v1.5H0z' },
  { name: 'triangles', d: 'M2 .056l1.9 3.291h-3.8zm4 4 1.9 3.291h-3.8z' },
  { name: 'cols', d: 'M3 0h1.5v8H3z' },
];

const byName = new Map(GLYPHS.map(g => [g.name, g]));

export function glyph(g) {
  const n = GLYPHS.length;
  const found = typeof g === 'string' ? byName.get(g) : Number.isInteger(g) ? GLYPHS[(g % n + n) % n] : typeof g?.d === 'string' && g;
  if (!found) throw new RangeError(typeof g === 'string' ? `hatch: no glyph named "${g}"` : 'hatch: not a glyph');
  return found;
}

export const name = g => glyph(g).name;

const key = g => glyph(g).key ?? name(g);

const path = (g, attrs) => g.invert
  ? `<path${attrs} fill-rule="evenodd" d="M0 0h${TILE}v${TILE}H0z${g.d}"/>`
  : `<path${attrs} d="${g.d}"/>`;

export function svg(g, { size = TILE, ink = '#000' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${TILE} ${TILE}">${path(glyph(g), ` fill="${ink}"`)}</svg>`;
}

// In an HTML style attribute, escape the double quotes.
export function url(g) {
  g = glyph(g);
  const d = g.invert ? `M0 0h${TILE}v${TILE}H0z${g.d}` : g.d;
  return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${TILE} ${TILE}'><path${g.invert ? " fill-rule='evenodd'" : ''} d='${d}'/></svg>")`;
}

// `on` is the fill as it looks on screen, so mix a translucent fill with what's behind it. Don't raise the step
// for contrast: it makes the fill look paler. clamp() because older engines lack sign().
export const INK = { mid: 0.6, step: 0.4 };

export function ink(on, { mid = INK.mid, step = INK.step } = {}) {
  const n = v => String(+v.toFixed(6)).replace(/^0\./, '.');
  return `oklch(from ${on} calc(l - clamp(-1,(l - ${n(mid - 1e-6)})*1e9,1)*${n(step)}) c h)`;
}

// currentColor inside a pattern resolves where the pattern is defined, not on the shape it fills, so the ink is
// fixed. For an ink that follows the shape, use mask().
export function pattern(g, { id = `hatch-${key(g)}`, size = TILE, ink = '#000', opacity = 1 } = {}) {
  const k = size / TILE;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">${path(glyph(g), ` fill="${ink}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}${k !== 1 ? ` transform="scale(${k})"` : ''}`)}</pattern>`;
}

// Duplicate ids or a <base href> break url(#…).
export function mask(g, { id = `hatch-${key(g)}-mask`, size = TILE } = {}) {
  return pattern(g, { id: `${id}-p`, size, ink: '#fff' })
    + `<mask id="${id}"><rect x="-1e4" y="-1e4" width="2e4" height="2e4" fill="url(#${id}-p)"/></mask>`;
}

export function keyed(order = GLYPHS.map(g => g.name)) {
  if (!order.length) throw new RangeError('hatch: keyed() needs glyphs');
  const seen = new Map();
  return key => {
    if (!seen.has(key)) seen.set(key, order[seen.size % order.length]);
    return seen.get(key);
  };
}

export function css({ prefix = 'hatch' } = {}) {
  if (!/^[a-z_][\w-]*$/i.test(prefix)) throw new RangeError(`hatch: bad prefix "${prefix}"`);
  const all = [prefix, ...GLYPHS.map(g => `${prefix}-${g.name}`)].map(c => `.${c}`).join(',');
  const color = `var(--${prefix}-ink,${ink(`var(--${prefix}-on,currentColor)`)})`;
  const m = `var(--${prefix}-g,linear-gradient(#0000,#0000)) 0 0/var(--${prefix}-size,${TILE}px)`;
  return `:where(${all}){position:relative}`
    + `:is(${all})::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;`
    + `background:${color};opacity:var(--${prefix}-a,.85);-webkit-mask:${m};mask:${m};`
    + `print-color-adjust:exact;forced-color-adjust:none}`
    + `@media (forced-colors:active){*{--${prefix}-ink:CanvasText!important;--${prefix}-a:1!important}}`
    + `.${prefix}-key{display:inline-block;width:${2 * TILE}px;height:${2 * TILE}px;border-radius:3px;overflow:hidden;vertical-align:-3px}`
    + `.${prefix}-edge::after{right:auto;width:var(--${prefix}-edge,${TILE}px)}`
    + `.${prefix}-ink{fill:${color};opacity:var(--${prefix}-a,.85)}`
    + GLYPHS.map(g => `.${prefix}-${g.name}{--${prefix}-g:${url(g)}}`).join('');
}

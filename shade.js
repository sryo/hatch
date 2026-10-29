import { TILE, name } from './hatch.js';

const f = v => String(+v.toFixed(3)).replace(/^(-?)0\./, '$1.');
const OFF = [-TILE, 0, TILE];

const around = (cx, cy, e, draw) => OFF.flatMap(ox => OFF.map(oy => [cx + ox, cy + oy]))
  .filter(([x, y]) => x + e > 0 && x - e < TILE && y + e > 0 && y - e < TILE)
  .map(([x, y]) => draw(x, y)).join('');

const circle = (x, y, r, back) =>
  `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 ${back ? 1 : 0} ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 ${back ? 1 : 0}-${f(2 * r)} 0z`;

const halfRing = (cx, up, t) => {
  const R = 2 + t / 2, r = 2 - t / 2, s = up ? 1 : 0;
  return `M${f(cx - R)} 4A${f(R)} ${f(R)} 0 0 ${s} ${f(cx + R)} 4H${f(cx + r)}A${f(r)} ${f(r)} 0 0 ${1 - s} ${f(cx - r)} 4z`;
};

const SHAPES = {
  diag: w => { const h = 4 * w; return `M0 ${f(8 - h)} ${f(8 - h)} 0H8v${f(h)}L${f(h)} 8H0zM0 0h${f(h)}L0 ${f(h)}zM8 ${f(8 - h)}V8h-${f(h)}z`; },
  back: w => { const h = 4 * w; return `M0 0h${f(h)}L8 ${f(8 - h)}V8h-${f(h)}L0 ${f(h)}zM0 ${f(8 - h)} ${f(h)} 8H0zM${f(8 - h)} 0H8v${f(h)}z`; },
  dots: w => { const r = Math.sqrt(32 * w / Math.PI); return [[2, 2], [6, 6]].map(([x, y]) => around(x, y, r, (a, b) => circle(a, b, r))).join(''); },
  squiggle: w => { const t = Math.min(4, 16 * w / Math.PI); return halfRing(2, true, t) + halfRing(6, false, t) + halfRing(-2, false, t) + halfRing(10, true, t); },
  grid: w => { const t = 8 * (1 - Math.sqrt(1 - w)); return `M0 0h8v${f(t)}H0zM0 ${f(t)}h${f(t)}V8H0z`; },
  zigzag: w => { const t = 8 * w; return `M${f(5.5 - t / 2)} 0L${f(2 - t / 2)} 4L${f(5.5 - t / 2)} 8H${f(5.5 + t / 2)}L${f(2 + t / 2)} 4L${f(5.5 + t / 2)} 0z`; },
  squares: w => { const s = 8 * Math.sqrt(w), o = 4 - s / 2; return `M${f(o)} ${f(o)}h${f(s)}v${f(s)}h-${f(s)}z`; },
  // The hole stops shrinking at r = 1.3 so rings never turn into dots; R stays under 2.83, where neighbors touch.
  rings: w => {
    const a = 32 * w / Math.PI, r = Math.sqrt(Math.max(1.69, 4 - a)), R = Math.sqrt(r * r + a);
    return [[2, 2], [6, 6]].map(([x, y]) => around(x, y, R, (a, b) => circle(a, b, R) + circle(a, b, r, true))).join('');
  },
  rows: w => { const t = 8 * w; return `M0 ${f(4 - t / 2)}h8v${f(t)}H0z`; },
  triangles: w => {
    const a = Math.sqrt(128 * w / Math.sqrt(3)), h = a * Math.sqrt(3) / 2;
    return [[2, 2.25], [6, 6.25]].map(([x, y]) => around(x, y, Math.max(a / 2, 2 * h / 3), (cx, cy) =>
      `M${f(cx)} ${f(cy - 2 * h / 3)} ${f(cx + a / 2)} ${f(cy + h / 3)}H${f(cx - a / 2)}z`)).join('');
  },
  cols: w => { const t = 8 * w; return `M${f(4 - t / 2)} 0h${f(t)}v8h-${f(t)}z`; },
};

export function shade(g, cover) {
  const n = name(g), v = cover > .5 ? 1 - cover : cover;
  if (!Object.hasOwn(SHAPES, n) || !(v >= 0)) throw new RangeError(`hatch: no shade of ${n} at ${cover}`);
  return { name: n, key: `${n}-${+(cover * 100).toFixed(1)}`, d: v ? SHAPES[n](v) : '', invert: cover > .5 };
}

export const ramp = (n, { from = .1, to = .85 } = {}) =>
  Array.from({ length: n }, (_, i) => n < 2 ? from : from + (to - from) * i / (n - 1));

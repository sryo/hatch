// Color math for tests: sRGB, OKLab/OKLCH and compositing. Colors are [r, g, b] in 0–1 sRGB.
// Out-of-gamut results are clipped per channel, as Chrome does.

import { INK } from './hatch.js';

const lin = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const gam = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
const clip = v => Math.min(1, Math.max(0, v));

export function oklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

export function rgb([L, C, H]) {
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
export const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));

// The ink hatch's CSS works out for a fill, mirrored here so tests can measure it.
export function inkOf(fill, { mid = INK.mid, step = INK.step } = {}) {
  const [L, C, H] = oklch(fill), m = +(mid - 1e-6).toFixed(6);
  return rgb([L - Math.min(1, Math.max(-1, (L - m) * 1e9)) * step, C, H]);
}

// OKLab distance, for how far one color moves from another.
export const distance = (a, b) => {
  const [p, q] = [a, b].map(c => { const [L, C, H] = oklch(c); return [L, C * Math.cos(H), C * Math.sin(H)]; });
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

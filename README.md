# hatch

Textures and shades for anything with a fill.

```bash
git clone https://github.com/sryo/hatch
```

Link `hatch.css`, add a class such as `hatch-dots` to an element with a background, and set `--hatch-on` to that background's color. For a shade, set `--hatch-g` on a `.hatch` element to what `url(shade('dots', .6))` returns (`url` from `hatch.js`, `shade` from `shade.js`). Serve the folder and open `index.html` to see them all.

import { writeFileSync } from 'node:fs';
import { css } from './hatch.js';

const out = css() + '\n';
writeFileSync(new URL('./hatch.css', import.meta.url), out);
console.log(`hatch.css ${out.length} B`);

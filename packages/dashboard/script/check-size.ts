import { join } from "node:path"

// First bundled shell: 9,274 bytes; 9,500 leaves 226 bytes for focused maintenance.
// M0 baseline: 7,615 bytes, separately minified with the same Bun/browser/IIFE options.
// M2 lookup validation: 9,939 bytes; keep about 2.5% headroom until the frame implementation.
const limit = 10_190
const bytes = (await Bun.file(join(import.meta.dirname, "../dist/shell.js")).bytes()).byteLength
console.log(`dashboard shell: ${bytes} / ${limit} bytes (before gzip)`)
if (bytes > limit) throw Error(`Dashboard shell exceeds the measured size budget by ${bytes - limit} bytes`)

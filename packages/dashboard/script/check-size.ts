import { join } from "node:path"

// M1 baseline: 9,474 bytes. M2 table limits: 12,473 bytes, with about 2.5% headroom.
const limit = 12_770
const bytes = (await Bun.file(join(import.meta.dirname, "../dist/shell.js")).bytes()).byteLength
console.log(`dashboard shell: ${bytes} / ${limit} bytes (before gzip)`)
if (bytes > limit) throw Error(`Dashboard shell exceeds the measured size budget by ${bytes - limit} bytes`)

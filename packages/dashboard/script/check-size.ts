import { join } from "node:path"

// M2: 13,491 bytes. M3 snapshots and CLI: 14,587 bytes, with about 1.6% headroom.
const limit = 14_820
const bytes = (await Bun.file(join(import.meta.dirname, "../dist/shell.js")).bytes()).byteLength
console.log(`dashboard shell: ${bytes} / ${limit} bytes (before gzip)`)
if (bytes > limit) throw Error(`Dashboard shell exceeds the measured size budget by ${bytes - limit} bytes`)

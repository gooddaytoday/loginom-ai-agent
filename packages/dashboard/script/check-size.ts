import { join } from "node:path"

// M4 publication failure notice with scrollable diagnostics: 15,358 bytes, with about 1.6% headroom.
const limit = 15_600
const bytes = (await Bun.file(join(import.meta.dirname, "../dist/shell.js")).bytes()).byteLength
console.log(`dashboard shell: ${bytes} / ${limit} bytes (before gzip)`)
if (bytes > limit) throw Error(`Dashboard shell exceeds the measured size budget by ${bytes - limit} bytes`)

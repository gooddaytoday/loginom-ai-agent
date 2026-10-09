import { finalizeTextImportCase } from "../src/text-import-finalize"

const [task, attempt, collection, cold] = process.argv.slice(2)
if (!task || !attempt || !collection) throw Error("usage: bun script/finalize-text-import.ts CASE ATTEMPT NEW_COLLECTION [COLD]")
console.log(await finalizeTextImportCase(task, attempt, collection, cold))

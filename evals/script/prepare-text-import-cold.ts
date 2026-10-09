import { prepareTextImportCold } from "../src/text-import-cold"

const [task, attempt, output, packagePath, ...extra] = process.argv.slice(2)
if (!task || !attempt || !output || !packagePath || extra.length)
  throw Error("usage: bun prepare-text-import-cold.ts CASE ATTEMPT NEW_OUTPUT /account/package.lgp")
await prepareTextImportCold(task, attempt, output, packagePath)

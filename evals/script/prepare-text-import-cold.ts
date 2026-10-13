import { prepareTextImportCold } from "../src/text-import-cold"
import type { TextImportCliPin } from "../src/text-import-cold"

const [task, attempt, output, packagePath, pinFile, ...extra] = process.argv.slice(2)
if (!task || !attempt || !output || !packagePath || extra.length)
  throw Error("usage: bun prepare-text-import-cold.ts CASE ATTEMPT NEW_OUTPUT /account/package.lgp [EXACT_CLI_PIN_JSON]")
await prepareTextImportCold(task, attempt, output, packagePath, pinFile ? await Bun.file(pinFile).json() as TextImportCliPin : undefined)

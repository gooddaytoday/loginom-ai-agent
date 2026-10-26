import { recoverRootPreparation } from "../src/root-terminality"
try {
  if (process.argv.length !== 3) throw Error("ROOT_RECOVERY_ARGUMENTS")
  console.log(JSON.stringify(await recoverRootPreparation(process.argv[2]!)))
} catch (error) { console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ROOT_TERMINALITY_RECOVERY_FAILED"); process.exitCode = 2 }

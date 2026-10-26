import { publishRootTerminality } from "../src/root-terminality-publisher"
try { await publishRootTerminality(process.argv[2] ?? "") }
catch (error) { console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ROOT_TERMINALITY_PUBLICATION_FAILED"); process.exitCode = 2 }

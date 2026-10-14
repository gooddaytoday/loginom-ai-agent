import { prepareLab57CleanupProposal } from "../src/lab57-cleanup-proposal"
if (Bun.argv.length !== 3) throw Error("Usage: bun script/prepare-lab57-owned-cleanup.ts <private-input.json>")
// File input, offline policy evaluation and a safe report are the entire interface.
// Intentionally no apply switch and no node-eval-ops command registration.
console.log(JSON.stringify(prepareLab57CleanupProposal(await Bun.file(Bun.argv[2]!).json()),null,2))

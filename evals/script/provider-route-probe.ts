import { probeProviderRoute } from "../src/provider-route-probe"

const [source, receipt, ...extra] = process.argv.slice(2)
if (!source || !receipt || extra.length || !process.env.EVAL_AGENT_PROVIDER_BASE_URL || !process.env.EVAL_AGENT_PROVIDER_API_KEY || !process.env.EVAL_PROVIDER_PROBE_LEDGER_DIR)
  throw Error("usage: assigned private provider environment + EVAL_PROVIDER_PROBE_LEDGER_DIR; bun script/provider-route-probe.ts <classified-timeout-receipt> <new-private-receipt>")
console.log(JSON.stringify(await probeProviderRoute({ source, receipt, ledgerDir: process.env.EVAL_PROVIDER_PROBE_LEDGER_DIR, url: process.env.EVAL_AGENT_PROVIDER_BASE_URL,
  apiKey: process.env.EVAL_AGENT_PROVIDER_API_KEY })))

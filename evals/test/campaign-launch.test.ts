import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { launchCampaign } from "../script/launch-campaign"

for (const failFirst of [false, true]) test(`launch reconciles lost responses and repeats after readiness repair (${failFirst})`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "campaign-launch-"))
  const issue = { id: "11111111-1111-4111-8111-111111111111", created_at: new Date().toISOString(), status: "in_progress", revision: 1 }
  const wakeups: Record<string, unknown>[] = []
  let lost = false
  const api = Bun.serve({ port: 0, fetch: async request => {
    const url = new URL(request.url)
    if (url.pathname === "/api/agents") return Response.json([{ id: "ops", name: "EvalOps" }])
    if (url.pathname.endsWith("/wakeups")) {
      if (request.method === "POST") {
        wakeups.push({ ...await request.json() as object, id: String(wakeups.length + 1), enabled: true })
        if (!lost) { lost = true; return new Response("lost", { status: 502 }) }
      }
      return Response.json(request.method === "POST" ? wakeups.at(-1) : wakeups)
    }
    return Response.json(issue)
  } })
  try {
    await mkdir(path.join(root, "state"))
    await Bun.write(path.join(root, "token"), "synthetic-token")
    await Bun.write(path.join(root, "controller.env"), "LAUNCH_TEST_CONFIG=accepted\n")
    await Bun.write(path.join(root, "batch.env"), "")
    const driver = path.join(root, "driver.ts")
    await Bun.write(driver, `import path from 'node:path'; import {mkdir,appendFile,chmod} from 'node:fs/promises';
const raw=Bun.argv.slice(2); const operation=raw.includes('--operation')?'reserve':raw[0]; const args=operation==='reserve'?[raw[raw.indexOf('--manifest')+1],raw[raw.indexOf('--initial-progress-at')+1]]:raw.slice(1); const root=${JSON.stringify(root)};
if (process.env.LAUNCH_TEST_CONFIG !== 'accepted') process.exit(10);
await appendFile(path.join(root,'calls.jsonl'),JSON.stringify([operation,...args])+'\\n');
if(operation==='reserve') {
 const manifest=JSON.parse(await Bun.file(args[0]!).text()); const dir=path.dirname(args[0]!);
 if(!await Bun.file(path.join(dir,'journal.json')).exists()) await Bun.write(path.join(dir,'journal.json'),JSON.stringify({initialProgressAt:args[1]})); await chmod(path.join(dir,'journal.json'),0o600);
} else if(operation==='prepare'||operation==='verify') {
 await mkdir(args[0]!,{recursive:true}); await Bun.write(path.join(args[0]!,'receipt.json'),JSON.stringify({ready:true,code:0,finalization:{status:'released'}})); await chmod(path.join(args[0]!,'receipt.json'),0o600);
 if(operation==='prepare' && ${failFirst} && !await Bun.file(path.join(root,'repaired')).exists()) { await Bun.write(path.join(args[0]!,'receipt.json'),JSON.stringify({ready:false,code:2})); await chmod(path.join(args[0]!,'receipt.json'),0o600); process.exit(2); }
} else if(operation==='enable') await Bun.write(path.join(root,'active'),'yes');
else if(operation==='is-active'||operation==='is-enabled') process.exit(await Bun.file(path.join(root,'active')).exists()?0:1);
`)
    const command = [process.execPath, driver]
    const server = path.join(root, "server.json")
    await Bun.write(server, JSON.stringify({ server: "test", harnessRoot: root, batchEnvFile: path.join(root, "batch.env"), stateRoot: path.join(root, "state"),
      multica: { url: api.url.origin, workspace: "test", tokenFile: path.join(root, "token") },
      launch: { campaignUnit: "eval-test@{campaign}.service", environmentFile: path.join(root, "controller.env"), controllerCommand: command,
        prepareCommand: [...command, "prepare", "{outputDir}"], verifyCommand: [...command, "verify", "{outputDir}"],
        serviceCommand: [...command] } }))
    await chmod(server, 0o600)
    const request = { issueId: issue.id, executor: "EvalBaseline", parallel: 2, batchSize: 2,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {
        EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/fixture/cli", EVAL_AGENT_MODEL: "fixture/model", EVAL_AGENT_VARIANT: "medium",
        JUDGE_MODEL: "fixture", JUDGE_REASONING: "high",
      }, limits: { maxStartedAttempts: 4 } }
    await expect(launchCampaign({ ...request, pins: { ...request.pins, EVAL_CLI_MODE: "source" } }, server))
      .rejects.toThrow("CAMPAIGN_EXPERIMENT_PINS_REQUIRED")
    expect(wakeups).toHaveLength(0)
    if (failFirst) {
      await expect(launchCampaign(request, server)).rejects.toThrow("CAMPAIGN_LAUNCH_PREPARE_FAILED")
      await Bun.write(path.join(root, "repaired"), "yes")
    }
    const first = await launchCampaign(request, server)
    const second = await launchCampaign(request, server)
    expect(second).toEqual(first)
    expect(wakeups).toHaveLength(2)
    const journal = await Bun.file(path.join(first.stateDir, "journal.json")).json()
    expect(journal.initialProgressAt).toBe(issue.created_at)
    const calls = (await Bun.file(path.join(root, "calls.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line) as string[])
    expect(calls.filter(call => call[0] === "enable")).toHaveLength(1)
    expect(calls.filter(call => call[0] === "prepare")).toHaveLength(1)
    expect(calls.filter(call => call[0] === "verify")).toHaveLength(failFirst ? 2 : 1)
  } finally { api.stop(true); await rm(root, { recursive: true, force: true }) }
})

import { expect, test } from "bun:test"
import { mkdtemp, mkdir, cp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { spawn } from "node:child_process"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { sandboxCommand } from "../src/sandbox"
import { verifyEvalrunnerCatalog, qualifyEvalrunnerCatalog } from "../src/evalrunner-catalog"
import { evalrunnerHash } from "../src/evalrunner-series"

test("pinned public catalog survives both child boundaries with only one read-only file visible", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-catalog-"))
  try {
    for (const name of ["installation/bin", "profile", "workspace", "catalog"])
      await mkdir(path.join(root, name), { recursive: true })
    const binary = path.join(root, "installation/bin/cli"), file = path.join(root, "catalog/models.json")
    await cp("/usr/bin/python3", binary, { dereference: true })
    await Bun.write(path.join(root, "installation/cli-manifest.json"), "{}")
    await Bun.write(file, JSON.stringify({ openai: { models: { "gpt-6.1-sol": { id: "gpt-6.1-sol", reasoning_options: [{ type: "effort", values: ["medium"] }] } } } }))
    await Bun.write(path.join(root, "catalog/secret"), "hidden")
    const sha256 = evalrunnerHash(await readFile(file))
    expect(await verifyEvalrunnerCatalog({ path: file, sha256 })).toMatchObject({ path: file, sha256, model: "openai/gpt-6.1-sol", variant: "medium" })
    const env = { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: binary, EVAL_PROFILE_DIR: path.join(root, "profile"),
      LOGINOM_DOCK_API_KEY: "private", LOGINOM_AI_AGENT_MODELS_PATH: file, LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1", LOGINOM_SECRET: "hidden" }
    const command = agentCommand(loadConfig(["--skip-judge"], env), env)
    expect(command.env.LOGINOM_AI_AGENT_MODELS_PATH).toBe(file)
    expect(command.env.LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH).toBe("1")
    expect(command.env.LOGINOM_SECRET).toBeUndefined()
    const script = "import os,pathlib,json; p=pathlib.Path(os.environ['LOGINOM_AI_AGENT_MODELS_PATH']); " +
      "print(json.dumps({'read':p.exists(),'sibling':(p.parent/'secret').exists(),'fetch':os.getenv('LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH'),'write':os.access(p,os.W_OK)}))"
    const boundary = await sandboxCommand({ cmd: [binary, "-c", script], env: command.env, profileDir: env.EVAL_PROFILE_DIR, workdir: path.join(root, "workspace") })
    const child = spawn(boundary.cmd[0]!, boundary.cmd.slice(1), { cwd: boundary.cwd, env: boundary.env, stdio: ["ignore", "pipe", "pipe", "ignore"] })
    const [code, stdout, stderr] = await Promise.all([new Promise(resolve => child.once("close", resolve)),
      Array.fromAsync(child.stdout!).then(chunks => Buffer.concat(chunks).toString()), Array.fromAsync(child.stderr!).then(chunks => Buffer.concat(chunks).toString())])
    expect(stderr).toBe(""); expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ read: true, sibling: false, fetch: "1", write: false })
    await expect(verifyEvalrunnerCatalog({ path: file, sha256: "0".repeat(64) })).rejects.toThrow("Catalog")
    await Bun.write(file, "{}"); await expect(verifyEvalrunnerCatalog({ path: file, sha256: evalrunnerHash("{}") })).rejects.toThrow("target/medium")
    await rm(file); await symlink("secret", file)
    await expect(verifyEvalrunnerCatalog({ path: file, sha256 })).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
}, 15_000)

test("catalog recognition initializes a private probe profile and verifies actual sandboxed output before admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-catalog-probe-"))
  try {
    for (const name of ["installation/bin", "installation/resources/loginom", "profile/data", "profile/config", "workspace"])
      await mkdir(path.join(root, name), { recursive: true, mode: 0o700 })
    const binary = path.join(root, "installation/bin/cli"), file = path.join(root, "models.json")
    await writeFile(binary + ".ts", "import {statSync,readFileSync} from 'node:fs';\n" +
      "const p=process.env.LOGINOM_AI_AGENT_CLI_PROFILE!;if((statSync(p).mode&0o777)!==0o700)throw Error('PROFILE_PERMISSIONS_INVALID');\n" +
      "if(JSON.parse(readFileSync(p+'/cli-profile.json','utf8')).channel!=='dev')throw Error('PROFILE_FORMAT_INVALID');\n" +
      "if(!JSON.parse(readFileSync(p+'/data/auth.json','utf8')).openai)throw Error('PROVIDER_NOT_FOUND');\n" +
      "if(process.env.LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH!=='1')throw Error('FETCH_ENABLED');console.log('openai/gpt-6.1-sol');")
    await Bun.$`${process.execPath} build ${binary + ".ts"} --compile --outfile ${binary}`.quiet()
    await cp("/usr/bin/true", path.join(root, "installation/resources/loginom/chrome"))
    await Bun.write(path.join(root, "installation/resources/loginom/resource-manifest.json"), '{"browser":"chrome"}')
    await Bun.write(path.join(root, "installation/cli-manifest.json"), "{}")
    await Bun.write(path.join(root, "profile/cli-profile.json"), '{"format":"loginom-cli","version":1,"channel":"dev"}')
    await writeFile(path.join(root, "profile/data/auth.json"), '{"openai":{"type":"fixture"}}', { mode: 0o600 })
    await writeFile(path.join(root, "profile/config/loginom-ai-agent.json"), '{"permission":{"loginom_*":"allow"}}', { mode: 0o644 })
    await Bun.write(file, JSON.stringify({ openai: { models: { "gpt-6.1-sol": { id: "gpt-6.1-sol", reasoning_options: [{ type: "effort", values: ["medium"] }] } } } }))
    const env = { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: binary, LOGINOM_DOCK_API_KEY: "fixture",
      LOGINOM_AI_AGENT_MODELS_PATH: file, LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1" }
    const result = await qualifyEvalrunnerCatalog({ workspace: path.join(root, "workspace"), profile: path.join(root, "profile") }, env, { path: file, sha256: evalrunnerHash(await readFile(file)) })
    expect(result).toMatchObject({ recognition: "confirmed", cleanup: "confirmed", productInferenceCalls: 0, judgeCalls: 0 })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 20_000)

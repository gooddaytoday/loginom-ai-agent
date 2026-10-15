import { expect, test } from "bun:test"
import { mkdtemp, mkdir, cp, readFile, rm, symlink } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { spawn } from "node:child_process"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { sandboxCommand } from "../src/sandbox"
import { verifyEvalrunnerCatalog } from "../src/evalrunner-catalog"
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

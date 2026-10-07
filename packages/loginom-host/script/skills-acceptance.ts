import { Schema } from "effect"
import { createHash } from "node:crypto"
import { chmod, cp, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"
import { verifyCliManifest } from "../src/cli-manifest"
import { verifyProductSkills } from "../src/bundled-skills"
import { decodeManifest, fileHash, verifyResourceTree } from "../../desktop/scripts/release/manifest"

// Live models only. Scripted oracle-provider remains a separate mechanics check.
const args = parseArgs({
  options: {
    interface: { type: "string" },
    artifact: { type: "string" },
    output: { type: "string" },
    model: { type: "string" },
    cases: { type: "string" },
    repeat: { type: "string", default: "3" },
    "cli-image": { type: "string" },
    headless: { type: "boolean", default: false },
  },
  strict: true,
}).values
if (process.platform !== "linux" || process.arch !== "x64") throw Error("SKILLS_ACCEPTANCE_LINUX_X64_ONLY")
if (
  !args.artifact ||
  !args.output ||
  !isAbsolute(args.artifact) ||
  !isAbsolute(args.output) ||
  !args.model ||
  !/^[^/\s]+\/.+/.test(args.model) ||
  !args.cases ||
  !["run", "desktop"].includes(args.interface ?? "")
)
  throw Error(
    "Required: --interface run|desktop --artifact <absolute payload|dist> --output <new absolute directory> --model <provider/model> --cases <ids> [--repeat 3] [--cli-image <installed seed image>] [--headless]",
  )
const repeat = Number(args.repeat)
if (!Number.isInteger(repeat) || repeat < 1) throw Error("SKILLS_ACCEPTANCE_REPEAT_INVALID")
if (args.interface === "run" && !args["cli-image"]) throw Error("SKILLS_ACCEPTANCE_INSTALLED_CLI_IMAGE_REQUIRED")
const repo = resolve(import.meta.dir, "../../..")
const artifact = await realpath(args.artifact)
const output = join(await realpath(dirname(args.output)), basename(args.output))
const contains = (root: string, path: string) =>
  relative(root, path) === "" ||
  (!relative(root, path).startsWith(".." + sep) && relative(root, path) !== ".." && !isAbsolute(relative(root, path)))
if ([artifact, repo].some((root) => contains(root, output) || contains(output, root)))
  throw Error("SKILLS_ACCEPTANCE_OUTPUT_OVERLAP")
const corpusBytes = await readFile(join(repo, "packages/agent/test/cli/package-docs-routing/cases.json"))
const corpusSchema = Schema.Struct({
  schema_version: Schema.Literal("loginom-skills-routing.v1"),
  fixtures: Schema.Record(Schema.String, Schema.String),
  cases: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      group: Schema.String,
      prompt: Schema.String,
      input: Schema.String,
      connection: Schema.optional(Schema.String),
      setup: Schema.optional(Schema.Unknown),
      followup: Schema.optional(Schema.Unknown),
      expected: Schema.Struct({ profile: Schema.String, result: Schema.Unknown }),
    }),
  ),
})
const corpus = Schema.decodeUnknownSync(corpusSchema)(JSON.parse(corpusBytes.toString()))
const ids = args.cases.split(",")
if (new Set(ids).size !== ids.length) throw Error("SKILLS_ACCEPTANCE_DUPLICATE_CASE")
const cases = ids.map((id) => {
  const value = corpus.cases.find((item) => item.id === id)
  if (!value) throw Error("SKILLS_ACCEPTANCE_UNKNOWN_CASE")
  if (!["docs", "default"].includes(value.group) || value.setup || value.followup)
    throw Error("SKILLS_ACCEPTANCE_MULTITURN_SCENARIO_ADAPTER_REQUIRED")
  if (
    ![
      "lgp-attachment",
      "lgp-and-png-attachments",
      "workspace-path",
      "missing-path",
      "none",
      "server-reference-only",
    ].includes(value.input) &&
    !(args.interface === "run" && value.input === "external-text-path")
  )
    throw Error("SKILLS_ACCEPTANCE_PERMISSION_ADAPTER_REQUIRED")
  return value
})
const resources = join(artifact, args.interface === "run" ? "resources/loginom" : "linux-unpacked/resources/loginom")
const cliMetadata =
  args.interface === "run" ? await verifyCliManifest(artifact, { platform: "linux", arch: "x64" }) : undefined
const desktopMetadata =
  args.interface === "desktop"
    ? decodeManifest(await Bun.file(join(artifact, "release-manifest.json")).json())
    : undefined
const source = cliMetadata ?? desktopMetadata!.source
if (("sourceDirty" in source && source.sourceDirty) || ("dirty" in source && source.dirty))
  throw Error("SKILLS_ACCEPTANCE_DIRTY_ARTIFACT")
const skills = await verifyProductSkills(resources)
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
if (desktopMetadata) {
  await verifyResourceTree(resources, desktopMetadata.runtime.resourcesSha256, "linux-x64")
  const executable = join(artifact, "loginom-ai-agent-linux-x86_64.AppImage")
  if (
    desktopMetadata.artifacts.find((item) => item.file === basename(executable))?.sha256 !==
    (await fileHash(executable))
  )
    throw Error("SKILLS_ACCEPTANCE_DESKTOP_ARTIFACT_MISMATCH")
}
const privateInput = await new Response(Bun.stdin.stream())
  .json()
  .then(
    Schema.decodeUnknownSync(
      Schema.Struct({
        apiKey: Schema.NonEmptyString,
        auth: Schema.Struct({ type: Schema.Literal("api"), key: Schema.NonEmptyString }),
      }),
    ),
  )
  .catch(() => {
    throw Error("SKILLS_ACCEPTANCE_PRIVATE_INPUT_INVALID")
  })
const image =
  args.interface === "run"
    ? (await command(["docker", "image", "inspect", "--format", "{{.Id}}", args["cli-image"]!])).trim()
    : undefined
const installed = cliMetadata
  ? `/home/tester/.local/share/loginom-ai-agent-cli/${cliMetadata.version}-${cliMetadata.channel}`
  : undefined
if (image) {
  const actual = await command([
    "docker",
    "run",
    "--rm",
    "--network",
    "none",
    "--entrypoint",
    "/bin/cat",
    image,
    installed + "/cli-manifest.json",
  ])
  if (sha(actual) !== sha(await readFile(join(artifact, "cli-manifest.json"))))
    throw Error("SKILLS_ACCEPTANCE_IMAGE_ARTIFACT_MISMATCH")
}
await mkdir(output, { mode: 0o700 })
// Only public test fixtures are mounted for the container's own non-root UID.
// The enclosing results directory remains private to the acceptance owner.
await mkdir(join(output, "inputs"), { mode: 0o755 })
await chmod(join(output, "inputs"), 0o755)
const fixtures = Object.fromEntries(
  await Promise.all(
    Object.entries(corpus.fixtures).map(async ([key, path]) => {
      const target = join(output, "inputs", key + "." + path.split(".").at(-1))
      await cp(join(repo, path), target, { errorOnExist: true })
      return [key, target] as const
    }),
  ),
)
const driver = join(import.meta.dir, "skills-acceptance", args.interface + ".mjs")
await cp(join(import.meta.dir, "skills-acceptance"), join(output, "driver"), { recursive: true, errorOnExist: true })
await cp(import.meta.filename, join(output, "driver/runner.ts"), { errorOnExist: true })
await writeFile(join(output, "corpus.json"), corpusBytes)
await writeFile(
  join(output, "conditions.json"),
  JSON.stringify(
    {
      interface: args.interface,
      source,
      model: args.model,
      variant: "default",
      repeat,
      cases,
      headless: args.headless,
      image,
      corpusSha256: sha(corpusBytes),
      driverSha256: sha(await readFile(driver)),
      driverFiles: await Promise.all(
        (await readdir(join(output, "driver")))
          .sort()
          .map(async (name) => ({ name, sha256: sha(await readFile(join(output, "driver", name))) })),
      ),
      fixtures: await Promise.all(
        Object.entries(fixtures).map(async ([name, path]) => ({ name, sha256: sha(await readFile(path)) })),
      ),
      skills,
      status: "LIVE_MECHANICS_ONLY_FACTS_LAYOUT_AND_REQUEST_SEMANTICS_REQUIRE_MANUAL_REVIEW",
    },
    null,
    2,
  ),
)
const payload = {
  apiKey: privateInput.apiKey,
  auth: privateInput.auth,
  artifact,
  resources,
  model: args.model,
  repeat,
  cases,
  fixtures,
  skills,
  headless: args.headless,
  output,
}
if (args.interface === "desktop") {
  const child = Bun.spawn(
    ["/usr/bin/xvfb-run", "-a", join(resources, "bin/node"), join(output, "driver/desktop.mjs")],
    { stdin: new Blob([JSON.stringify(payload)]), stdout: "pipe", stderr: "pipe" },
  )
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  requireRedacted(out + err)
  await writeFile(join(output, "driver.log"), out + err)
  process.stdout.write(out)
  process.exitCode = code
}
if (args.interface === "run") {
  const failures: string[] = []
  for (const testcase of cases) {
    await mkdir(join(output, testcase.id), { mode: 0o700 })
    for (let attempt = 1; attempt <= repeat; attempt++) {
      const runRoot = join(output, testcase.id, "attempt-" + attempt)
      await mkdir(runRoot, { mode: 0o700 })
      const container = "loginom-skills-" + sha(output).slice(0, 12) + "-" + testcase.id + "-" + attempt
      const child = Bun.spawn(
        [
          "docker",
          "run",
          "-i",
          "--name",
          container,
          "--init",
          "--network",
          "host",
          "--shm-size",
          "1g",
          "--security-opt",
          "seccomp=unconfined",
          "--security-opt",
          "apparmor=unconfined",
          "--mount",
          `type=bind,src=${join(output, "driver")},dst=/test,readonly`,
          "--mount",
          `type=bind,src=${join(output, "inputs")},dst=/inputs,readonly`,
          ...["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"]
            .filter((key) => process.env[key])
            .flatMap((key) => ["--env", key]),
          "--entrypoint",
          installed + "/resources/loginom/bin/node",
          image!,
          "/test/run.mjs",
        ],
        {
          stdin: new Blob([
            JSON.stringify({
              ...payload,
              testcase,
              attempt,
              installed,
              fixtures: Object.fromEntries(
                Object.entries(fixtures).map(([key, path]) => [key, "/inputs/" + basename(path)]),
              ),
            }),
          ]),
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const [code, out, err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      try {
        requireRedacted(out + err)
        await writeFile(join(runRoot, "driver.log"), out + err)
        await writeFile(join(runRoot, "exit.json"), JSON.stringify({ code }))
        await command(["docker", "cp", container + ":/home/tester/evidence", runRoot])
      } finally {
        await command(["docker", "rm", container])
      }
      if (code !== 0) failures.push(testcase.id + ":" + attempt)
      process.stdout.write(JSON.stringify({ case: testcase.id, attempt, code, manualReviewRequired: true }) + "\n")
    }
  }
  await writeFile(join(output, "summary.json"), JSON.stringify({ failures, manualReviewRequired: true }, null, 2))
  if (failures.length) process.exitCode = 1
}

function requireRedacted(text: string) {
  if ([privateInput.apiKey, privateInput.auth.key].some((key) => text.includes(key)))
    throw Error("SKILLS_ACCEPTANCE_SECRET_IN_RESULT")
}

async function command(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (code !== 0) throw Error("SKILLS_ACCEPTANCE_COMMAND_FAILED")
  requireRedacted(out + err)
  return out
}

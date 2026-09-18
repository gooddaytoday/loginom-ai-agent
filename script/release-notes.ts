#!/usr/bin/env bun

import { parseArgs } from "node:util"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"

// Hashes the downloaded release assets, writes SHA256SUMS.txt next to them and renders the draft release notes.
const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    tag: { type: "string" },
    channel: { type: "string" },
    assets: { type: "string" },
    output: { type: "string" },
  },
  strict: true,
}).values
if (!args.tag || !args.channel || !args.assets || !args.output)
  throw new Error("Required: --tag vX.Y.Z --channel prod|beta --assets <directory> --output <markdown>")

const version = args.tag.replace(/^v/, "")
const commit = (await $`git rev-parse --verify ${args.tag + "^{commit}"}`.text()).trim()
const previous = (
  await $`git describe --tags --abbrev=0 --match ${"v*"} --exclude ${args.tag} ${args.tag}`.nothrow().quiet().text()
).trim()
const range = previous ? `${previous}..${args.tag}` : args.tag
const changes = (await $`git log --no-merges --max-count=200 --format=${"- %h %s"} ${range}`.text()).trimEnd()

const dir = path.resolve(args.assets)
const files = (await readdir(dir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS.txt")
  .map((entry) => entry.name)
  .sort()
const hashes = new Map(
  await Promise.all(files.map(async (file) => [file, await sha256(path.join(dir, file))] as const)),
)
await Bun.write(path.join(dir, "SHA256SUMS.txt"), files.map((file) => `${hashes.get(file)}  ${file}\n`).join(""))

const matrix = await report("linux-matrix.json")
const matrixStatus = !matrix
  ? "Docker matrix report missing"
  : matrix.reports.every((entry: { status: string }) => entry.status === "PASS")
    ? `Docker matrix PASS (${matrix.reports.map((entry: { name: string }) => entry.name).join(", ")})`
    : "Docker matrix FAIL"
const candidate = "unsigned candidate; platformAcceptance=pending; native acceptance NOT_RUN"
const expected: [file: string, status: string][] = [
  ["loginom-ai-agent-linux-amd64.deb", `${await staticStatus("static-deb.json")} + ${matrixStatus}`],
  ["loginom-ai-agent-linux-x86_64.AppImage", `${await staticStatus("static-appimage.json")} + ${matrixStatus}`],
  [
    `loginom-ai-agent-cli-${version}-linux-x64.tar.gz`,
    "static verify PASS (cli-manifest); Docker matrix covers the DEB only",
  ],
  ["loginom-ai-agent-win-x64.exe", candidate],
  [`loginom-ai-agent-cli-${version}-win32-x64.zip`, candidate],
  ["loginom-ai-agent-mac-arm64.dmg", candidate],
  ["loginom-ai-agent-mac-arm64.zip", candidate],
  [`loginom-ai-agent-cli-${version}-darwin-arm64.tar.gz`, candidate],
  [`loginom-ai-agent-${version}-source.tar.gz`, "source archive (git archive HEAD)"],
  ["release-manifest.json", "Linux release manifest (unsigned)"],
  ["static-deb.json", "static verification report"],
  ["static-appimage.json", "static verification report"],
  ["linux-matrix.json", "Docker matrix report"],
]
const rows = [
  ...expected.map(([file, status]) =>
    hashes.has(file) ? `| ${file} | ${hashes.get(file)} | ${status} |` : `| ${file} | — | BLOCKED: build job failed |`,
  ),
  ...files
    .filter((file) => !expected.some(([name]) => name === file))
    .map((file) => `| ${file} | ${hashes.get(file)} | metadata |`),
  "| SHA256SUMS.txt | — | checksums of every asset above |",
]
const notes = [
  `# Loginom AI Agent ${args.tag}`,
  "",
  `- Version: ${version}`,
  `- Channel: ${args.channel}`,
  `- Commit: ${commit}`,
  "- Linux x64 DEB/AppImage/CLI: static verification and offline Docker matrix from this run (reports attached)",
  "- Windows x64 and macOS arm64: unsigned candidates without native acceptance; not for distribution",
  "- Signing: none on any platform",
  "",
  "## Assets",
  "",
  "| Asset | SHA256 | Status |",
  "| --- | --- | --- |",
  ...rows,
  "",
  previous ? `## Changes since ${previous}` : "## Changes",
  "",
  changes || "- No commits",
  "",
].join("\n")
await Bun.write(args.output, notes)
console.log(notes)

async function sha256(file: string) {
  const hasher = new Bun.CryptoHasher("sha256")
  for await (const chunk of Bun.file(file).stream()) hasher.update(chunk)
  return hasher.digest("hex")
}

async function report(name: string) {
  const file = Bun.file(path.join(dir, name))
  if (!(await file.exists())) return undefined
  return file.json()
}

async function staticStatus(name: string) {
  const result = await report(name)
  if (result?.status === "PASS") return "static verify PASS"
  return "static verify report missing"
}

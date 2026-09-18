import { expect, test } from "bun:test"
import path from "node:path"
import { cp, mkdtemp, utimes, writeFile } from "node:fs/promises"
import os from "node:os"
import { cleanupArtifact, fetchArtifact, findListing, parseArtifactSource, parseFindOutput } from "../src/artifact"
import { evalsRoot } from "../src/config"

const docker = { container: "c", storageDir: "/s" }
const storage = parseArtifactSource(`dir:${path.join(evalsRoot, "fixtures", "storage")}`, docker)

test("parseFindOutput: режет строки по табуляции и считает mtimeMs из секунд", () => {
  expect(parseFindOutput("a.lgp\t1758190000.123\nb.csv\t1758190001\n")).toEqual([
    { name: "a.lgp", mtimeMs: 1758190000.123 * 1000 },
    { name: "b.csv", mtimeMs: 1758190001 * 1000 },
  ])
  expect(parseFindOutput("")).toEqual([])
})

test("findListing: Bun.$ передаёт -printf одним аргументом", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-find-"))
  await writeFile(path.join(dir, "one.lgp"), "a")
  await writeFile(path.join(dir, "two.csv"), "b")
  const names = parseFindOutput(await findListing(dir)).map((entry) => entry.name)
  expect(names.sort()).toEqual(["one.lgp", "two.csv"])
})

test("fetchArtifact: по квитанции копирует .lgp, распаковывает Unit.xml, собирает файлы результата", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  const artifact = await fetchArtifact({
    source: storage,
    username: "user",
    receipts: ["/user/fixture-group-sum-qty.lgp"],
    instructed: "eval-x-group-sum-qty-1.lgp",
    resultPrefix: "fixture-group-sum-qty",
    since: Date.now(),
    outDir,
  })
  expect(artifact?.origin).toBe("receipt")
  expect(artifact?.packagePath).toBe("/user/fixture-group-sum-qty.lgp")
  expect(artifact?.resultFiles).toEqual(["fixture-group-sum-qty.result.csv"])
  const units = await Array.fromAsync(new Bun.Glob("Unit_*/Unit.xml").scan(artifact!.unpackedDir))
  expect(units.length).toBeGreaterThan(0)
  expect(await Bun.file(path.join(outDir, "results", "fixture-group-sum-qty.result.csv")).exists()).toBe(true)
})

test("fetchArtifact: без квитанции берёт предписанное имя", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  const artifact = await fetchArtifact({
    source: storage,
    username: "user",
    receipts: [],
    instructed: "fixture-group-sum-qty.lgp",
    resultPrefix: "none",
    since: Date.now(),
    outDir,
  })
  expect(artifact?.origin).toBe("instructed")
  expect(artifact?.resultFiles).toEqual([])
})

test("fetchArtifact: scan берёт новейший .lgp после старта, перечисляет остальные, игнорирует .~lgp", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-"))
  const lgp = path.join(evalsRoot, "fixtures", "storage", "fixture-group-sum-qty.lgp")
  const since = Date.now() - 1_000
  await cp(lgp, path.join(dir, "older.lgp"))
  await cp(lgp, path.join(dir, "newest.lgp"))
  await cp(lgp, path.join(dir, "newest.~lgp"))
  await utimes(path.join(dir, "older.lgp"), new Date(since + 1_000), new Date(since + 1_000))
  await utimes(path.join(dir, "newest.lgp"), new Date(since + 5_000), new Date(since + 5_000))
  await utimes(path.join(dir, "newest.~lgp"), new Date(since + 9_000), new Date(since + 9_000))
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  const artifact = await fetchArtifact({
    source: parseArtifactSource(`dir:${dir}`, docker),
    username: "user",
    receipts: [],
    instructed: "missing.lgp",
    resultPrefix: "none",
    since,
    outDir,
  })
  expect(artifact?.origin).toBe("scan")
  expect(artifact?.packagePath).toBe("/user/newest.lgp")
  expect(artifact?.ambiguous).toEqual(["older.lgp"])
})

test("fetchArtifact: файлы результата только с префиксом и точкой", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-"))
  const lgp = path.join(evalsRoot, "fixtures", "storage", "fixture-group-sum-qty.lgp")
  await cp(lgp, path.join(dir, "p.lgp"))
  await writeFile(path.join(dir, "p.result.csv"), "ok")
  await writeFile(path.join(dir, "p1.result.csv"), "no")
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  const artifact = await fetchArtifact({
    source: parseArtifactSource(`dir:${dir}`, docker),
    username: "user",
    receipts: ["/user/p.lgp"],
    instructed: "x.lgp",
    resultPrefix: "p",
    since: Date.now(),
    outDir,
  })
  expect(artifact?.resultFiles).toEqual(["p.result.csv"])
})

test("fetchArtifact: ZIP без Unit.xml — артефакта нет", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  const artifact = await fetchArtifact({
    source: storage,
    username: "user",
    receipts: ["/user/not-a-package.lgp"],
    instructed: "x.lgp",
    resultPrefix: "none",
    since: Date.now(),
    outDir,
  })
  expect(artifact).toBeUndefined()
})

test("parseArtifactSource: неверное значение — EvalFailure; cleanup для dir ничего не удаляет", async () => {
  expect(() => parseArtifactSource("s3://x", docker)).toThrow("EVAL_ARTIFACT_SOURCE")
  expect(() => parseArtifactSource("s3://x", docker)).toThrow(expect.objectContaining({ exitCode: 2 }))
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-artifact-"))
  const artifact = await fetchArtifact({
    source: storage,
    username: "user",
    receipts: ["/user/fixture-group-sum-qty.lgp"],
    instructed: "x.lgp",
    resultPrefix: "fixture-group-sum-qty",
    since: Date.now(),
    outDir,
  })
  await cleanupArtifact(storage, artifact!)
  expect(await Bun.file(path.join(evalsRoot, "fixtures", "storage", "fixture-group-sum-qty.lgp")).exists()).toBe(true)
})

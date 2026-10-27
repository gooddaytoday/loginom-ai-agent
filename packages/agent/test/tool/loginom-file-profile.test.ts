import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile, appendFile, symlink, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  profileFile,
  scanFile,
  sampleFile,
  profilePage,
  exactFileDigest,
} from "../../src/tool/loginom-file-profile-core"
import { inspectReferenceFile } from "@loginom-ai-agent/loginom-host/file-reference"

async function fixture(bytes: Buffer | string, run: (path: string, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "file-profile-test-"))
  try {
    const path = join(dir, "input.csv")
    await writeFile(path, bytes)
    await run(path, join(dir, "session"))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("staging digest comes only from an exact scan of the same identity, not a quick or partial profile", async () => {
  await fixture("region;amount\nNorth;25\nSouth;50\n", async (path, dir) => {
    const profile = await profileFile(path, dir, { first_line_as_title: true })
    const identity = await inspectReferenceFile(path)
    expect(await exactFileDigest(identity, dir)).toBeUndefined()
    const scan = await scanFile(profile.profile_id, dir)
    expect(await exactFileDigest(identity, dir)).toBe(scan.sha256)
    expect(await exactFileDigest({ ...identity, file_id: "0:0" }, dir)).toBeUndefined()
    // Two contradictory exact receipts for the same identity fail closed.
    const stored = JSON.parse(await readFile(join(dir, profile.profile_id + ".json"), "utf8"))
    stored.profile_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    stored.scan.sha256 = "0".repeat(64)
    await writeFile(join(dir, stored.profile_id + ".json"), JSON.stringify(stored))
    await expect(exactFileDigest(identity, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
  })
})

test("quoted records across blocks, CRLF, decimal comma, skip and exact count", async () => {
  const input = 'preamble\r\nregion;amount;note\r\nNorth;12,50;"one\r\ntwo ""quoted"""\r\nSouth;3,25;NULL\r\n'
  await fixture(input, async (path, dir) => {
    const p = await profileFile(path, dir, { rows_to_skip: 1, first_line_as_title: true })
    expect(p.settings.format.delimiter).toBe(";")
    expect(p.settings.format.decimal_separator).toBe(",")
    expect(p.settings.columns[1].type).toBe("real")
    expect((await scanFile(p.profile_id, dir, { chunk_bytes: 7 })).records).toBe(2)
    const s = await sampleFile(p.profile_id, dir, { seed: 12, max_records: 2 })
    expect((await readFile(s.path)).equals(Buffer.from(input))).toBe(true)
    expect(s.manifest.records).toBe(2)
  })
})

test.each(["\r", "\r\n", "\n"])("headerless %j counts terminator once and retains internal blank", async (eol) => {
  await fixture(`1\t2${eol}${eol}3\t4${eol}`, async (path, dir) => {
    const p = await profileFile(path, dir, { first_line_as_title: false, delimiter: "\t" })
    const scan = await scanFile(p.profile_id, dir, { chunk_bytes: 2 })
    expect(scan.records).toBe(3)
    expect(scan.first_violation?.logical_record).toBe(2)
  })
})

test.each(["utf-16le", "utf-16be"])("%s BOM and split code units", async (encoding) => {
  const bytes = Buffer.from("\ufeffregion;amount\nNorth;1,25\nSouth;2,50\n", "utf16le")
  if (encoding === "utf-16be") bytes.swap16()
  await fixture(bytes, async (path, dir) => {
    const p = await profileFile(path, dir)
    expect(p.encoding.name).toBe(encoding)
    expect((await scanFile(p.profile_id, dir, { chunk_bytes: 3 })).records).toBe(2)
    const s = await sampleFile(p.profile_id, dir, { max_records: 2 })
    expect((await readFile(s.path)).equals(bytes)).toBe(true)
  })
})

test("cp1251, cp1252, ASCII ambiguity and UTF8 BOM", async () => {
  for (const [bytes, encoding] of [
    [Buffer.from("726567696f6e3b616d6f756e740acee1ebe0f1f2fc3b312c32350a", "hex"), "windows-1251"],
    [Buffer.from("name,amount\nCaf\xe9,1.25\n", "latin1"), "windows-1252"],
    [Buffer.from("\ufeffregion;amount\nNorth;1,25\n"), "utf-8"],
  ] as const) {
    await fixture(bytes, async (path, dir) => {
      const p = await profileFile(path, dir)
      expect(p.encoding.name).toBe(encoding)
      expect((await scanFile(p.profile_id, dir)).records).toBe(1)
    })
  }
  await fixture("name,amount\nNorth,1.25\n", async (path, dir) => {
    const p = await profileFile(path, dir)
    expect(p.encoding.ambiguity).toContain("ASCII")
  })
})

test("late type violation outside confirmed windows carries exact coordinates", async () => {
  const head = "region;amount\n" + "North;1,25\n".repeat(450000)
  await fixture(head + "South;wrong\n", async (path, dir) => {
    const p = await profileFile(path, dir)
    expect(p.status).toBe("partial")
    const scan = await scanFile(p.profile_id, dir)
    expect(scan.records).toBe(450001)
    expect(scan.first_violation).toMatchObject({
      logical_record: 450001,
      physical_line: 450002,
      byte_offset: Buffer.byteLength(head),
      column: 2,
      expected_type: "real",
      example: "wrong",
    })
    expect(scan.sha256).toHaveLength(64)
  })
})

test("deterministic sample copies original byte slices and respects byte cap", async () => {
  await fixture(
    "\ufeffregion;amount\r\n" + Array.from({ length: 200 }, (_, i) => `N${i};${i},25\r\n`).join(""),
    async (path, dir) => {
      const p = await profileFile(path, dir)
      await scanFile(p.profile_id, dir)
      const a = await sampleFile(p.profile_id, dir, { seed: 42, max_records: 20, max_bytes: 200 })
      const b = await sampleFile(p.profile_id, dir, { seed: 42, max_records: 20, max_bytes: 200 })
      expect(a.manifest.sha256).toBe(b.manifest.sha256)
      const original = await readFile(path)
      expect(
        (await readFile(a.path)).equals(
          Buffer.concat(a.manifest.offsets.map((r) => original.subarray(r.start, r.end))),
        ),
      ).toBe(true)
      expect(a.manifest.bytes).toBeLessThanOrEqual(200)
      expect(a.manifest.method).toBe("head+reservoir")
    },
  )
})

test("changed source invalidates scan, pagination and sample", async () => {
  await fixture("name;amount\na;1\n", async (path, dir) => {
    const p = await profileFile(path, dir)
    await appendFile(path, "b;2\n")
    await expect(scanFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await expect(sampleFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await expect(profilePage(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
  })
})

test("cancellation stays partial; oversized and malformed records fail explicitly", async () => {
  await fixture("x;y\n1;2\n", async (path, dir) => {
    const p = await profileFile(path, dir)
    const abort = new AbortController()
    abort.abort()
    expect((await scanFile(p.profile_id, dir, { signal: abort.signal })).status).toBe("partial")
  })
  await fixture('x;y\n"unterminated', async (path, dir) => {
    await expect(profileFile(path, dir)).rejects.toThrow("LOGINOM_FILE_INVALID_RECORD")
  })
  await fixture('x;y\n"' + "x".repeat(8 * 1024 * 1024) + '";1\n', async (path, dir) => {
    const p = await profileFile(path, dir, { delimiter: ";", first_line_as_title: true })
    await expect(scanFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_INVALID_RECORD")
  })
})

test("wide profile paginates under 8 KiB without claiming complete settings", async () => {
  await fixture(
    Array.from({ length: 300 }, (_, i) => `column${i}`).join(";") + "\n" + Array(300).fill("1").join(";") + "\n",
    async (path, dir) => {
      let p = await profileFile(path, dir)
      let count = p.settings.columns.length
      expect(p.settings_complete).toBe(false)
      while (p.continuation) {
        expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(8192)
        p = await profilePage(p.profile_id, dir, p.continuation)
        count += p.settings.columns.length
      }
      expect(count).toBe(300)
    },
  )
})

test("BOMless UTF16, final unterminated record and a quote pair at a buffer boundary", async () => {
  for (const big of [false, true]) {
    const input =
      'name;amount;note\nNorth;1,25;"' + (big ? "a".repeat(256 * 1024 - 28) : "") + '""quoted""\nnext"\nSouth;2,50;end'
    await fixture(input, async (path, dir) => {
      const p = await profileFile(path, dir, { first_line_as_title: true })
      expect((await scanFile(p.profile_id, dir)).records).toBe(2)
    })
  }
  await fixture(Buffer.from("name\tamount\nNorth\t2.50", "utf16le"), async (path, dir) => {
    const p = await profileFile(path, dir)
    expect(p.encoding.name).toBe("utf-16le")
    expect((await scanFile(p.profile_id, dir)).records).toBe(1)
  })
})

test("invalid UTF8 is never silently replaced, and redirected source symlink invalidates profile", async () => {
  await fixture(Buffer.from([110, 59, 120, 10, 255, 59, 49, 10]), async (path, dir) => {
    await expect(profileFile(path, dir, { encoding: "UTF-8" })).rejects.toThrow("LOGINOM_FILE_FORMAT_AMBIGUOUS")
  })
  await fixture("name;amount\na;1\n", async (path, dir) => {
    const alias = path + ".link"
    await symlink(path, alias)
    const p = await profileFile(alias, dir)
    await writeFile(path + ".new", "name;amount\nb;2\n")
    await unlink(alias)
    await symlink(path + ".new", alias)
    await expect(scanFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await expect(sampleFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
  })
})

test("NULL after the first hundred records is inferred before exact type validation", async () => {
  await fixture("region;amount\n" + "North;1,25\n".repeat(100) + "South;NULL\n", async (path, dir) => {
    const p = await profileFile(path, dir)
    expect(p.settings.format.null_marker).toBe("NULL")
    expect((await scanFile(p.profile_id, dir)).first_violation).toBeUndefined()
  })
})

test("single quote dialect and explicit unambiguous date format", async () => {
  await fixture(
    "region;amount;note;date\nNorth;1,25;'a;''b''';25/10/2026\nSouth;2,50;'next';26/10/2026\n",
    async (path, dir) => {
      const p = await profileFile(path, dir)
      expect(p.settings.format.text_qualifier).toBe("'")
      expect(p.settings.format.date_format).toBe("dd/mm/yyyy")
      expect(p.settings.columns[3].type).toBe("datetime")
      expect((await scanFile(p.profile_id, dir)).records).toBe(2)
    },
  )
})

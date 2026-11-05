import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { writeUpdateS3Resource } from "./bundle-loginom"

test("Desktop resource contains only the read key; disabled or partial builds cannot reuse a stale key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "update-resource-"))
  const file = join(dir, "updates-s3.json")
  const env = {
    LOGINOM_UPDATES_S3_ENDPOINT: "https://s3.example.test",
    LOGINOM_UPDATES_S3_REGION: "ru-central-1",
    LOGINOM_UPDATES_S3_BUCKET: "updates-test",
    LOGINOM_UPDATES_S3_READ_ACCESS_KEY: "tenant:read-key",
    LOGINOM_UPDATES_S3_READ_SECRET_KEY: "read-test-secret",
    LOGINOM_UPDATES_S3_WRITE_ACCESS_KEY: "tenant:write-key",
    LOGINOM_UPDATES_S3_WRITE_SECRET_KEY: "write-test-secret",
  }
  try {
    expect(await writeUpdateS3Resource(file, env)).toBe(true)
    expect(await Bun.file(file).json()).toEqual({
      endpoint: env.LOGINOM_UPDATES_S3_ENDPOINT + "/",
      region: env.LOGINOM_UPDATES_S3_REGION,
      bucket: env.LOGINOM_UPDATES_S3_BUCKET,
      accessKeyId: env.LOGINOM_UPDATES_S3_READ_ACCESS_KEY,
      secretAccessKey: env.LOGINOM_UPDATES_S3_READ_SECRET_KEY,
    })
    expect(await Bun.file(file).text()).not.toContain("write-")
    expect(await writeUpdateS3Resource(file, {})).toBe(false)
    expect(await Bun.file(file).exists()).toBe(false)
    await writeUpdateS3Resource(file, env)
    await expect(writeUpdateS3Resource(file, { ...env, LOGINOM_UPDATES_S3_READ_SECRET_KEY: "" })).rejects.toThrow(
      "S3_CONFIG_INVALID",
    )
    expect(await Bun.file(file).exists()).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

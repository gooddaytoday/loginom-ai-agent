import { expect, test } from "bun:test"
import { removeFixture } from "./remove-fixture"

function locked(times: number, code = "EBUSY") {
  const calls: string[] = []
  const remove = async (path: string) => {
    calls.push(path)
    if (calls.length <= times) throw Object.assign(Error(`${code}: resource busy or locked, rm '${path}'`), { code })
  }
  return { calls, remove }
}
const sleep = async () => {}

test("Windows fixture removal waits for a transient EBUSY image lock to clear", async () => {
  const fake = locked(3)
  await removeFixture("C:/fixture", { platform: "win32", remove: fake.remove, sleep })
  expect(fake.calls).toEqual(Array(4).fill("C:/fixture"))
})

test("a lock that never clears still fails after the bounded wait", async () => {
  const fake = locked(Infinity)
  await expect(removeFixture("C:/fixture", { platform: "win32", remove: fake.remove, sleep, attempts: 5 })).rejects.toMatchObject({ code: "EBUSY" })
  expect(fake.calls).toHaveLength(5)
})

test("other errors and other platforms are not retried", async () => {
  const denied = locked(1, "EACCES")
  await expect(removeFixture("C:/fixture", { platform: "win32", remove: denied.remove, sleep })).rejects.toMatchObject({ code: "EACCES" })
  expect(denied.calls).toHaveLength(1)
  const posix = locked(1)
  await expect(removeFixture("/fixture", { platform: "linux", remove: posix.remove, sleep })).rejects.toMatchObject({ code: "EBUSY" })
  expect(posix.calls).toHaveLength(1)
})

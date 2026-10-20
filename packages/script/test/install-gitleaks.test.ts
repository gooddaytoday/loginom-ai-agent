import { expect, test } from "bun:test"
import { verifyChecksum } from "../src/install-gitleaks"

test("official checksum must match the exact downloaded asset", () => {
  const data = new TextEncoder().encode("fixture archive")
  const checksum = new Bun.CryptoHasher("sha256").update(data).digest("hex")
  expect(() => verifyChecksum(data, `${checksum}  archive.tar.gz\n`, "archive.tar.gz")).not.toThrow()
  expect(() => verifyChecksum(new Uint8Array([0]), `${checksum}  archive.tar.gz\n`, "archive.tar.gz")).toThrow()
  expect(() => verifyChecksum(data, `${checksum}  other.tar.gz\n`, "archive.tar.gz")).toThrow()
})

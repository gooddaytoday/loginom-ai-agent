import { expect, test } from "bun:test"
import { cliCapabilities } from "../src/cli-capabilities"

test("shared OAuth is advertised only for the supported Linux x64 target", () => {
  expect(cliCapabilities("linux", "x64", "glibc")).toEqual(["shared-oauth-v1"])
  for (const [platform, arch] of [
    ["linux", "arm64"],
    ["darwin", "arm64"],
    ["win32", "x64"],
  ])
    expect(cliCapabilities(platform, arch)).toEqual([])
})

test("musl and undeclared ABI never advertise shared OAuth", () => {
  expect(cliCapabilities("linux", "x64", "musl")).toEqual([])
  expect(cliCapabilities("linux", "x64")).toEqual([])
})

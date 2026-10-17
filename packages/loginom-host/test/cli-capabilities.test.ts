import { expect, test } from "bun:test"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyCliCapabilities } from "../script/verify-cli-capabilities"

test("legacy manifests never execute the candidate to discover capabilities", async () => {
  await verifyCliCapabilities("/nonexistent/legacy")
})

test.skipIf(process.platform === "win32")(
  "capability probe checks executable output with no inherited credentials",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "capability-fixture-"))
    const binary = join(directory, "cli")
    try {
      await writeFile(
        binary,
        '#!/bin/sh\n[ "$1" = --capabilities ] || exit 2\n' +
          '[ -z "$LOGINOM_AI_AGENT_AUTH_CONTENT" ] || exit 3\n' +
          '[ -z "$MULTICA_TOKEN" ] || exit 4\n' +
          "printf '%s\\n' '{\"capabilities\":[\"shared-oauth-v1\"]}'\n",
        { mode: 0o700 },
      )
      await verifyCliCapabilities(binary, ["shared-oauth-v1"])
      await writeFile(binary, "#!/bin/sh\nprintf '%s\\n' '{\"capabilities\":[]}'\n")
      await expect(verifyCliCapabilities(binary, ["shared-oauth-v1"])).rejects.toThrow(
        "LOGINOM_CANDIDATE_CAPABILITIES_MISMATCH",
      )
      await writeFile(binary, "#!/bin/sh\nprintf '%s\\n' 'credential-looking-output'\nexit 1\n")
      await expect(verifyCliCapabilities(binary, ["shared-oauth-v1"])).rejects.toThrow(
        "LOGINOM_CANDIDATE_CAPABILITIES_MISMATCH",
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

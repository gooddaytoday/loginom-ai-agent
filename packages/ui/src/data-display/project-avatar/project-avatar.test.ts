import { createHash } from "crypto"
import { describe, expect, test } from "bun:test"
import { getProjectAvatarSource } from "./project-avatar"

describe("getProjectAvatarSource", () => {
  test("prefers a chosen image, then a chosen color, then the automatic icon", () => {
    expect(getProjectAvatarSource("abc", { override: "data:image/png;base64,AA==", url: "data:auto" })).toBe(
      "data:image/png;base64,AA==",
    )
    expect(getProjectAvatarSource("abc", { color: "blue", url: "data:auto" })).toBeUndefined()
    expect(getProjectAvatarSource("abc", { url: "data:auto" })).toBe("data:auto")
  })

  // Loginom AI Agent (B4.11e): the app's own project shows the product mark from the bundle, as in 0.4, and the
  // avatar sends no request to opencode.ai.
  test("shows the bundled product mark for the app's own project, by remote or by the 0.4 root commit", async () => {
    const mark = await Bun.file(
      new URL("../../../../../apps/loginom-site/assets/loginom-icon.svg", import.meta.url),
    ).text()

    const remote = createHash("sha1").update("git-remote:github.com/anomalyco/opencode").digest("hex")

    for (const id of [remote, "4b0ea68d7af9a6031a7ffda7ad66e0cb83315750"]) {
      const source = getProjectAvatarSource(id) ?? ""

      // An address with a scheme would load from the network; Bun resolves the bundled asset to its file.
      expect(URL.canParse(source)).toBe(false)
      expect(await Bun.file(source).text()).toBe(mark)
    }

    expect(getProjectAvatarSource(remote, { override: "data:custom" })).toBe("data:custom")
    expect(getProjectAvatarSource(remote, { color: "blue" })).toBeUndefined()
  })
})

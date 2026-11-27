import { expect, test } from "bun:test"
import { conversationScope, packageLocation, permissionDescription } from "./permission-model"

const request = (action: string, ...resources: string[]) => ({ action, resources })

test("offers the scope of the approved product action", () => {
  expect(conversationScope(request("edit", "a.md"))).toBe("scopeWrite")
  expect(conversationScope(request("external_directory", "/elsewhere/*"))).toBe("scopeRead")
  expect(conversationScope(request("loginom_dock_action_run", "*"))).toBe("scopeSave")
  expect(conversationScope(request("dashboard_publish", "*"))).toBe("scopeSave")
  expect(conversationScope(request("loginom_dock_prepare", "local_package"))).toBe("scopeSave")
  expect(conversationScope(request("loginom_dock_node_apply", "exports.csv", "exports.text"))).toBe("scopeExport")
  expect(conversationScope(request("webfetch", "https://example.test"))).toBe("scopeWeb")
  expect(conversationScope(request("websearch", "words"))).toBe("scopeWeb")
})

test("keeps terminal and destructive answers one-time and leaves unrelated actions to the native dock", () => {
  for (const action of [request("shell", "git status"), request("dashboard_delete", "*"), request("read", "a.md")]) {
    expect(conversationScope(action)).toBeUndefined()
    expect(permissionDescription(action)).toBeDefined()
  }

  for (const action of [
    request("loginom_dock_prepare", "*"),
    request("loginom_dock_node_apply", "exports.text", "transform.sort"),
    request("linear_save_comment", "*"),
  ]) {
    expect(conversationScope(action)).toBeUndefined()
    expect(permissionDescription(action)).toBeUndefined()
  }
})

test("shows the original package folder for Windows and POSIX paths", () => {
  expect(packageLocation("C:\\Projects\\test.lgp")).toEqual({ name: "test.lgp", folder: "C:\\Projects" })
  expect(packageLocation("C:\\test.lgp")).toEqual({ name: "test.lgp", folder: "C:\\" })
  expect(packageLocation("/test.lgp")).toEqual({ name: "test.lgp", folder: "/" })
  expect(packageLocation("test.lgp")).toEqual({ name: "test.lgp", folder: undefined })
})

/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { useRenderer } from "@opentui/solid"
import { onCleanup, Show } from "solid-js"
import { tmpdir } from "../../../fixture/fixture"
import { createTuiResolvedConfig } from "../../../fixture/tui-runtime"
import { directory, json, mount, wait } from "./sync-fixture"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { TuiConfigProvider } from "../../../../src/config"
import { LocationProvider } from "../../../../src/context/location"
import { useSync } from "../../../../src/context/sync"
import { ThemeProvider } from "../../../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../../src/keymap"
import { PermissionPrompt } from "../../../../src/routes/session/permission"

function branchEvent(branch: string, workspace?: string): GlobalEvent {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    workspace,
    payload: {
      id: `evt_vcs_${branch}`,
      type: "vcs.branch.updated",
      properties: { branch },
    },
  }
}

describe("tui sync", () => {
  test("auto mode replies to ordinary requests and leaves skill installation pending", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const replies: string[] = []
    const request = {
      id: "per_install",
      sessionID: "ses_skill",
      permission: "skill_install",
      patterns: ["check-columns"],
      always: [],
      metadata: { operationId: "prepared", skillInstall: ["Install check-columns", "Revision: chosen-revision"] },
    }

    function RenderPermission() {
      const sync = useSync()
      const config = createTuiResolvedConfig()
      const renderer = useRenderer()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      onCleanup(registerOpencodeKeymap(keymap, renderer, config))
      return (
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <ThemeProvider mode="dark">
              <LocationProvider>
                <Show when={sync.data.permission[request.sessionID]?.[0]}>
                  {(pending) => <PermissionPrompt request={pending()} />}
                </Show>
              </LocationProvider>
            </ThemeProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      )
    }

    const { app, emit, sync } = await mount((url) => {
      if (!url.pathname.startsWith("/permission/")) return
      replies.push(url.pathname)
      return json(true)
    }, tmp.path, { auto: true, render: RenderPermission })

    try {
      emit({
        directory,
        payload: { id: "evt_install", type: "permission.asked", properties: request },
      })
      emit({
        directory,
        payload: { id: "evt_read", type: "permission.asked", properties: { ...request, id: "per_read", permission: "read", metadata: {} } },
      })
      await wait(() => sync.data.permission[request.sessionID]?.length === 1 && replies.length > 0)
      expect(sync.data.permission[request.sessionID]).toEqual([request])
      expect(replies).toEqual(["/permission/per_read/reply"])
      const frame = await app.waitForFrame((frame) => frame.includes("Revision: chosen-revision"))
      expect(frame).toContain("Install check-columns")
      expect(frame).toContain("Allow once")
      expect(frame).toContain("Reject")
      expect(frame).not.toContain("Allow always")
      app.mockInput.pressEnter()
      await wait(() => replies.length === 2)
      expect(replies[1]).toBe("/permission/per_install/reply")
    } finally {
      app.renderer.destroy()
    }
  })

  test("refresh scopes sessions by default and lists project sessions when disabled", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, kv, sync, session } = await mount(undefined, tmp.path)

    try {
      expect(kv.get("session_directory_filter_enabled", true)).toBe(true)
      expect(session.at(-1)?.searchParams.get("roots")).toBeNull()
      expect(session.at(-1)?.searchParams.get("scope")).toBeNull()
      expect(session.at(-1)?.searchParams.get("path")).toBe("packages/tui")

      kv.set("session_directory_filter_enabled", false)
      await sync.session.refresh()

      expect(session.at(-1)?.searchParams.get("scope")).toBe("project")
      expect(session.at(-1)?.searchParams.get("path")).toBeNull()
      expect(session.at(-1)?.searchParams.get("roots")).toBeNull()
    } finally {
      app.renderer.destroy()
    }
  })

  test("vcs branch updates only apply for the active workspace", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, project, sync } = await mount(undefined, tmp.path)

    try {
      expect(sync.data.vcs?.branch).toBe("main")

      project.workspace.set("ws_a")
      emit(branchEvent("other", "ws_b"))
      await Bun.sleep(30)

      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("feature", "ws_a"))
      await wait(() => sync.data.vcs?.branch === "feature")

      expect(sync.data.vcs?.branch).toBe("feature")
    } finally {
      app.renderer.destroy()
    }
  })
})

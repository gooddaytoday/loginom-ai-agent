import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import {
  normalizeNewSessionWorktree,
  resolveNewSessionBranch,
  resolveNewSessionWorktree,
} from "./new-session-workspace-controller"

describe("new session workspace selection", () => {
  for (const git of [false, true]) {
    test(`branch initialization ${git ? "loads only Git worktrees" : "does not bootstrap the global non-Git root"}`, () => {
      // Isolate hook mocks from other UI tests while running the production controller.
      const script = `
        import { mock } from "bun:test"
        import { createRoot } from "solid-js"
        const calls = []
        const git = ${git}
        mock.module("@/context/sdk", () => ({ useSDK: () => () => ({ directory: git ? "/repo/feature" : "C:/owned/Default Project" }) }))
        mock.module("@/context/sync", () => ({ useSync: () => () => ({ project: { worktree: git ? "/repo" : "/", vcs: git ? "git" : undefined, sandboxes: [] } }) }))
        mock.module("@/context/server-sync", () => ({ useServerSync: () => () => ({ child: directory => {
          calls.push(directory)
          if (directory === "/") throw Error("UNEXPECTED_DRIVE_ROOT_BOOTSTRAP")
          return [{ vcs: { branch: directory === "/repo" ? "main" : "feature" } }]
        } }) }))
        const { createNewSessionWorkspaceController } = await import("./src/pages/new-session/new-session-workspace-controller.ts")
        createRoot(dispose => {
          const controller = createNewSessionWorkspaceController()
          console.log(JSON.stringify({ calls, visible: controller.bar.visible(), branch: controller.bar.branch() }))
          dispose()
        })
      `
      const result = Bun.spawnSync([process.execPath, "--conditions=solid", "--preload", "../ui/test/solid-jsx.ts", "--preload", "./happydom.ts", "--eval", script], {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: { ...process.env, VITE_LOGINOM_AI_AGENT_CHANNEL: "dev" },
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(result.stderr.toString()).not.toContain("UNEXPECTED_DRIVE_ROOT_BOOTSTRAP")
      expect(result.exitCode).toBe(0)
      const value = JSON.parse(result.stdout.toString())
      expect(value.visible).toBe(git)
      expect(value.calls).toEqual(git ? ["/repo", "/repo/feature"] : [])
      if (git) expect(value.branch).toBe("feature")
      else expect(value.branch).toBeUndefined()
    })
  }

  test("uses main when the workspace bar is unavailable", () => {
    expect(
      resolveNewSessionWorktree({
        enabled: false,
        selected: "/project/feature",
        directory: "/project/feature",
        projectWorktree: "/project",
      }),
    ).toBe("main")
  })

  test("derives an existing worktree from the current directory", () => {
    expect(
      resolveNewSessionWorktree({ enabled: true, directory: "/project/feature", projectWorktree: "/project" }),
    ).toBe("/project/feature")
    expect(resolveNewSessionWorktree({ enabled: true, directory: "/project", projectWorktree: "/project" })).toBe(
      "main",
    )
  })

  test("normalizes main to the project root outside the main worktree", () => {
    expect(normalizeNewSessionWorktree("main", "/project/feature", "/project")).toBe("/project")
    expect(normalizeNewSessionWorktree("main", "/project", "/project")).toBe("main")
  })

  test("falls back to the local branch for main, create, and unknown worktrees", () => {
    const branch = (worktree: string) => (worktree === "/project/feature" ? "feature" : undefined)
    expect(resolveNewSessionBranch({ worktree: "main", local: "dev", worktreeBranch: branch })).toBe("dev")
    expect(resolveNewSessionBranch({ worktree: "create", local: "dev", worktreeBranch: branch })).toBe("dev")
    expect(resolveNewSessionBranch({ worktree: "/project/feature", local: "dev", worktreeBranch: branch })).toBe(
      "feature",
    )
    expect(resolveNewSessionBranch({ worktree: "/missing", local: "dev", worktreeBranch: branch })).toBe("dev")
  })
})

import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test("the retired skill publisher refuses before reading caller files or opening a network connection", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-retired-publisher-"))
  try {
    const archive = join(root, "reviewed.zip")
    const admin = join(root, "admin.json")
    const report = join(root, "report.json")
    await Bun.write(admin, '{"user_key":"UNIT-NONSECRET"}')
    await Bun.write(archive, "caller-provided bytes")
    const script = resolve(import.meta.dir, "../../../services/loginom-ai/deploy/loginom-dock/publish-skill.py")
    const child = Bun.spawn(["python3", "-c", `
import runpy, sys
script, root = sys.argv[1:3]
def guard(event, args):
    if event == "open" and isinstance(args[0], str) and args[0].startswith(root + "/"):
        raise SystemExit("UNEXPECTED_CALLER_FILE_ACCESS")
    if event.startswith("socket."):
        raise SystemExit("UNEXPECTED_NETWORK_ACCESS")
sys.addaudithook(guard)
sys.argv = [script, *sys.argv[3:]]
runpy.run_path(script, run_name="__main__")
`, script, root, "--archive", archive, "--admin", admin, "--report", report,
      "--endpoint", "http://127.0.0.1:1"], { stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ])
    expect(stderr).not.toContain("UNEXPECTED_CALLER_FILE_ACCESS")
    expect(code).toBe(2)
    expect(stdout).toBe("")
    expect(stderr).toContain("LOGINOM_SKILL_PUBLICATION_DISABLED")
    expect(stderr).toContain("packages/product/skills/loginom-automation")
    expect(stderr).not.toContain("UNEXPECTED_")
    expect(await Bun.file(report).exists()).toBe(false)
    expect(await Bun.file(admin).text()).toBe('{"user_key":"UNIT-NONSECRET"}')
    expect(await Bun.file(archive).text()).toBe("caller-provided bytes")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

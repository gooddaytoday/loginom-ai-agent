import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { archiveDiagnostics } from "../src/diagnostics"

test("archiveDiagnostics: только собственные execution journals, redaction и проверенные hashes", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-archive-profile-"))
  const own = path.join(profile, "loginom/runtime/generations/1/chats/chat/attempts/own")
  const foreign = path.join(path.dirname(own), "foreign")
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-archive-out-"))
  try {
    await mkdir(path.join(own, "browser-profile"), { recursive: true })
    await mkdir(foreign)
    await Bun.write(path.join(own, "execution-events.jsonl"), JSON.stringify({ phase: "AMBIGUOUS", config: { apiKey: "hidden-config-credential" }, auth: { access_token: "hidden-auth-credential" }, note: "hidden-config-credential hidden-auth-credential", password: "secret-password",
      receipt: JSON.stringify({ apiKey: "dock-key-value", note: "secret-password", url: "https://user:password@host/?token=secret" }) }) + "\n")
    await Bun.write(path.join(own, "browser-profile", "Cookies"), "private-browser-cookie")
    await Bun.write(path.join(own, "session.json"), "private-config")
    await Bun.write(path.join(foreign, "execution-events.jsonl"), "unrelated")
    const archive = await archiveDiagnostics(profile, [own], out, ["secret-password", "dock-key-value"])
    expect(archive.files).toHaveLength(1)
    const text = await Bun.file(path.join(out, archive.files[0]!.archive)).text()
    expect(text).toContain("AMBIGUOUS")
    for (const secret of ["hidden-config-credential", "hidden-auth-credential", "secret-password", "dock-key-value", "user:password", "token=secret", "private-config", "private-browser-cookie", "unrelated"])
      expect(text).not.toContain(secret)
    expect(archive.files[0]!.sha256).toBe(new Bun.CryptoHasher("sha256").update(text).digest("hex"))
    expect(await Bun.file(path.join(out, "diagnostics/manifest.json")).json()).toEqual(archive)
    expect(await Bun.file(path.join(own, "execution-events.jsonl")).exists()).toBe(true)
  } finally { await rm(profile, { recursive: true }); await rm(out, { recursive: true }) }
})

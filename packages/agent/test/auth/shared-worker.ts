// Real subprocess fixture: only fake credentials and a loopback HTTP endpoint.
import { SharedAuth } from "../../src/auth/shared"

const [mode, dir, url, provider = "openai"] = process.argv.slice(2)
try {
  if (mode === "refresh") {
    const auth = await SharedAuth.refresh(dir, provider, async () => {
      const response = await fetch(`${url}/token`)
      if (!response.ok) throw new Error("FAKE_REFRESH_FAILED")
      return response.json()
    })
    const response = await fetch(`${url}/model`, { headers: { authorization: `Bearer ${auth.access}` } })
    if (!response.ok) throw new Error("FAKE_MODEL_FAILED")
  }
  if (mode === "remove")
    await SharedAuth.mutate(dir, provider, (data) => {
      delete data[provider]
      return data
    })
  if (mode === "set")
    await SharedAuth.mutate(dir, provider, (data) => ({ ...data, [provider]: { type: "api", key: "fake" } }))
  if (mode === "read") await SharedAuth.read(dir)
  process.stdout.write("OK\n")
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "FAILED"}\n`)
  process.exitCode = 1
}

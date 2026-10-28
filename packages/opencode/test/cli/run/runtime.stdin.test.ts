import { describe, expect, test } from "bun:test"
import { Readable } from "node:stream"
import { INTERACTIVE_INPUT_ERROR, resolveInteractiveStdin } from "@/cli/cmd/run/runtime.stdin"

function stream(isTTY: boolean) {
  return Object.assign(new Readable({ read() {} }), { isTTY }) as NodeJS.ReadStream
}

describe("run interactive stdin", () => {
  test("reuses stdin when it is already a tty", () => {
    const stdin = stream(true)
    const seen: string[] = []
    const result = resolveInteractiveStdin(
      stdin,
      (path) => {
        seen.push(path)
        return stream(true)
      },
      "linux",
    )

    expect(result.stdin).toBe(stdin)
    expect(result.cleanup).toBeUndefined()
    expect(seen).toEqual([])
  })

  test("opens the controlling terminal when stdin is piped", () => {
    const tty = stream(true)
    const seen: string[] = []
    const result = resolveInteractiveStdin(
      stream(false),
      (path) => {
        seen.push(path)
        return tty
      },
      "linux",
    )

    expect(result.stdin).toBe(tty)
    expect(seen).toEqual(["/dev/tty"])

    result.cleanup?.()
    expect(tty.destroyed).toBe(true)
  })

  test("uses CONIN$ on windows", () => {
    const seen: string[] = []
    resolveInteractiveStdin(
      stream(false),
      (path) => {
        seen.push(path)
        return stream(true)
      },
      "win32",
    )

    expect(seen).toEqual(["CONIN$"])
  })

  test("throws a clear error when no controlling terminal is available", () => {
    expect(() =>
      resolveInteractiveStdin(
        stream(false),
        () => {
          throw new Error("open failed")
        },
        "linux",
      ),
    ).toThrow(INTERACTIVE_INPUT_ERROR)
  })
})

test.each([false, true])("standalone prompt stdin releases its signal handler; cancel=%s", async (cancel) => {
  const module = new URL("../../../src/cli/cmd/run/runtime.stdin.ts", import.meta.url).pathname
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import { readPromptStdin } from ${JSON.stringify(module)};
    const before = process.listenerCount('SIGINT');
    const reading = readPromptStdin(true);
    await Bun.write(Bun.stdout, 'READY\\n');
    const result = await reading;
    await Bun.write(Bun.stdout, JSON.stringify({ result, released: process.listenerCount('SIGINT') === before }));
    process.exit(result.cancelled ? 130 : 0);
  `,
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  )
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000)
  try {
    const reader = child.stdout.getReader()
    const ready = await reader.read()
    expect(Buffer.from(ready.value!).toString()).toBe("READY\n")
    if (cancel) child.kill("SIGINT")
    if (!cancel) {
      child.stdin.write("строка\n")
      child.stdin.end()
    }
    expect(await child.exited).toBe(cancel ? 130 : 0)
    const chunks: Uint8Array[] = []
    while (true) {
      const next = await reader.read()
      if (next.done) break
      chunks.push(next.value)
    }
    expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
      result: cancel ? { cancelled: true } : { cancelled: false, text: "строка\n" },
      released: true,
    })
    expect(await new Response(child.stderr).text()).toBe("")
  } finally {
    clearTimeout(timer)
    child.kill()
  }
})

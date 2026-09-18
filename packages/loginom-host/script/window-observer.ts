// Manual Linux/X11 acceptance: only observe windows owned by this test's browser.
export function observeBrowserWindows(directory: string) {
  if (process.platform !== "linux" || !process.env.DISPLAY) throw Error("X11 display required for window acceptance")
  const pids = new Set<number>()
  const visible = new Map<string, number>()
  const state = { stopped: false }
  const watching = (async () => {
    while (!state.stopped) {
      const child = Bun.spawn(["ps", "-eo", "pid=,args="], { stdout: "pipe", stderr: "ignore" })
      const output = await new Response(child.stdout).text()
      if ((await child.exited) !== 0) throw Error("Cannot inspect browser processes")
      for (const line of output.split("\n")) {
        if (line.includes(directory) && line.includes("--user-data-dir="))
          pids.add(Number(line.trim().split(/\s/, 1)[0]))
      }
      for (const id of await windows()) {
        const property = Bun.spawn(["xprop", "-id", id, "_NET_WM_PID"], { stdout: "pipe", stderr: "ignore" })
        const text = await new Response(property.stdout).text()
        await property.exited
        const pid = Number(text.match(/=\s*(\d+)/)?.[1])
        if (!pids.has(pid)) continue
        const info = Bun.spawn(["xwininfo", "-id", id], { stdout: "pipe", stderr: "ignore" })
        const textInfo = await new Response(info.stdout).text()
        await info.exited
        if (textInfo.includes("Map State: IsViewable")) visible.set(id, pid)
      }
      await Bun.sleep(250)
    }
  })().then(
    () => undefined,
    (error: unknown) => error,
  )
  return async () => {
    state.stopped = true
    const failure = await watching
    if (failure) throw failure
    return {
      visible: [...visible].map(([window, pid]) => ({ window, pid })),
      remaining: (await windows()).filter((id) => visible.has(id)),
      browserProcesses: pids.size,
    }
  }
}

async function windows() {
  const child = Bun.spawn(["xprop", "-root", "_NET_CLIENT_LIST"], { stdout: "pipe", stderr: "ignore" })
  const output = await new Response(child.stdout).text()
  if ((await child.exited) !== 0) throw Error("Cannot inspect X11 windows")
  return output.match(/0x[0-9a-f]+/gi) ?? []
}

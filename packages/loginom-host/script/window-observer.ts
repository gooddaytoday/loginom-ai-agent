// Manual native acceptance: only observe windows owned by this test's browser.
export function observeBrowserWindows(directory: string) {
  if (process.platform === "win32") return observeWindowsBrowserWindows(directory)
  if (process.platform !== "linux" || !process.env.DISPLAY) throw Error("Native window observer unavailable")
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

function observeWindowsBrowserWindows(directory: string) {
  const pids = new Set<number>()
  const visible = new Map<string, number>()
  const state = { stopped: false }
  const watching = (async () => {
    while (!state.stopped) {
      const snapshot = await windowsSnapshot(directory)
      snapshot.processes.forEach((pid) => pids.add(pid))
      snapshot.windows.forEach(({ window, pid }) => visible.set(window, pid))
      await Bun.sleep(500)
    }
  })().then(
    () => undefined,
    (error: unknown) => error,
  )
  return async () => {
    state.stopped = true
    const failure = await watching
    if (failure) throw failure
    const current = await windowsSnapshot(directory)
    return {
      visible: [...visible].map(([window, pid]) => ({ window, pid })),
      remaining: current.windows.filter(({ window }) => visible.has(window)).map(({ window }) => window),
      browserProcesses: pids.size,
    }
  }
}

async function windowsSnapshot(directory: string) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$root=$env:LOGINOM_WINDOW_OBSERVER_ROOT",
    "$processes=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($root,[System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine.IndexOf('--user-data-dir=',[System.StringComparison]::OrdinalIgnoreCase) -ge 0 })",
    "$ids=@($processes | ForEach-Object { [int]$_.ProcessId })",
    "$windows=@(foreach($id in $ids){ $p=Get-Process -Id $id -ErrorAction SilentlyContinue; if($p -and $p.MainWindowHandle -ne 0){ [pscustomobject]@{ window=('0x{0:x}' -f $p.MainWindowHandle.ToInt64()); pid=[int]$id } } })",
    "[pscustomobject]@{ processes=$ids; windows=$windows } | ConvertTo-Json -Compress -Depth 3",
  ].join(";")
  const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, LOGINOM_WINDOW_OBSERVER_ROOT: directory },
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  if ((await child.exited) !== 0) {
    await stderr
    throw Error("Cannot inspect Windows browser processes")
  }
  const parsed = JSON.parse(await stdout) as { processes?: number | number[]; windows?: { window: string; pid: number } | { window: string; pid: number }[] }
  return {
    processes: parsed.processes === undefined ? [] : Array.isArray(parsed.processes) ? parsed.processes : [parsed.processes],
    windows: parsed.windows === undefined ? [] : Array.isArray(parsed.windows) ? parsed.windows : [parsed.windows],
  }
}

async function windows() {
  const child = Bun.spawn(["xprop", "-root", "_NET_CLIENT_LIST"], { stdout: "pipe", stderr: "ignore" })
  const output = await new Response(child.stdout).text()
  if ((await child.exited) !== 0) throw Error("Cannot inspect X11 windows")
  return output.match(/0x[0-9a-f]+/gi) ?? []
}

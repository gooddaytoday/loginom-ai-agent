import { execFile } from "node:child_process"
import { win32 } from "node:path"
import { promisify } from "node:util"
import { setTimeout as delay } from "node:timers/promises"

export async function showBrowserWindow(page, browserPath) {
  if (!page || page.isClosed()) return { kind: "unavailable" }
  const fallback = { kind: process.platform === "win32" ? "taskbar" : "manual" }
  const session = await page
    .context()
    .newCDPSession(page)
    .catch(() => undefined)
  if (!session) return page.isClosed() ? { kind: "unavailable" } : fallback
  try {
    const window = await session.send("Browser.getWindowForTarget")
    if (window.bounds.windowState === "minimized") {
      await session.send("Browser.setWindowBounds", { windowId: window.windowId, bounds: { windowState: "normal" } })
    }
    await session.send("Page.bringToFront")
    // CDP acknowledges activation even when the window manager keeps focus elsewhere.
    const deadline = Date.now() + 500
    do {
      const { result } = await session.send("Runtime.evaluate", {
        expression: "document.hasFocus()",
        returnByValue: true,
      })
      if (result.value === true) {
        if (process.platform === "win32" && !(await foregroundOnWindows(browserPath))) return fallback
        return { kind: "focused" }
      }
      await delay(50)
    } while (Date.now() < deadline)
    return fallback
  } catch {
    return page.isClosed() ? { kind: "unavailable" } : fallback
  } finally {
    await session.detach().catch(() => undefined)
  }
}

const exec = promisify(execFile)

async function foregroundOnWindows(browserPath) {
  if (!browserPath || !process.env.SYSTEMROOT) return false
  // Each persistent context has its own Chromium process, launched by this runtime.
  // Page.bringToFront alone also reports success when Windows denied the activation.
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')
Add-Type -Namespace Loginom -Name Foreground -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hwnd, out uint processId);
'@
$foregroundWindow = [Loginom.Foreground]::GetForegroundWindow()
[uint32] $foregroundId = 0
[void] [Loginom.Foreground]::GetWindowThreadProcessId($foregroundWindow, [ref] $foregroundId)
if ($foregroundId) {
  $browser = Get-CimInstance Win32_Process -Filter "ProcessId=$foregroundId"
  if ($browser.ParentProcessId -eq ${process.pid} -and [Loginom.Foreground]::GetForegroundWindow() -eq $foregroundWindow) {
    $browser.ExecutablePath
  }
}
`
  const powershell = win32.join(process.env.SYSTEMROOT, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ]
  const { stdout } = await exec(powershell, args, { timeout: 8000, windowsHide: true })
  return win32.normalize(stdout.trim()).toLowerCase() === win32.normalize(browserPath).toLowerCase()
}

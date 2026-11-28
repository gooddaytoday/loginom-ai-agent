import { DataType, close, load, open } from "ffi-rs"
import { win32 } from "node:path"

export function foregroundChromium(browserPID: number) {
  const root = process.env.SYSTEMROOT
  if (!root || !win32.isAbsolute(root)) return false
  const user = "loginom-user32"
  const kernel = "loginom-kernel32"
  let userOpen = false
  let kernelOpen = false
  try {
    open({ library: user, path: win32.join(root, "System32", "user32.dll") })
    userOpen = true
    open({ library: kernel, path: win32.join(root, "System32", "kernel32.dll") })
    kernelOpen = true
    const foreground = () => load({ library: user, funcName: "GetForegroundWindow", retType: DataType.BigInt,
      paramsType: [], paramsValue: [] })
    const window = foreground()
    if (!window) return false
    const thread = load({ library: user, funcName: "GetWindowThreadProcessId", retType: DataType.U32,
      paramsType: [DataType.BigInt, DataType.BigInt], paramsValue: [window, 0n] })
    if (!thread) return false
    const handle = load({ library: kernel, funcName: "OpenThread", retType: DataType.BigInt,
      paramsType: [DataType.U32, DataType.I32, DataType.U32], paramsValue: [0x0800, 0, thread] })
    if (!handle) return false
    try {
      const pid = load({ library: kernel, funcName: "GetProcessIdOfThread", retType: DataType.U32,
        paramsType: [DataType.BigInt], paramsValue: [handle] })
      return pid === browserPID && foreground() === window
    } finally {
      load({ library: kernel, funcName: "CloseHandle", retType: DataType.I32, paramsType: [DataType.BigInt], paramsValue: [handle] })
    }
  } catch {
    return false
  } finally {
    if (kernelOpen) close(kernel)
    if (userOpen) close(user)
  }
}

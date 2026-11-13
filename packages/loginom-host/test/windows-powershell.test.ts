import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { win32 } from "node:path"
import { WINDOWS_POWERSHELL_TIMEOUT_MS, windowsPowerShellArguments } from "../src/windows-powershell"

test("DPAPI gives cold PowerShell a bounded startup allowance and sanitizes failures", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const built = await Bun.build({ entrypoints: [new URL("../src/connection/cli-dpapi.ts", import.meta.url).pathname], target: "node" })
  expect(built.success).toBe(true)
  const module = "data:text/javascript;base64," + Buffer.from(await built.outputs[0].text()).toString("base64")
  const child = Bun.spawn([node, "--input-type=module"], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  child.stdin.write(`
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events';
    Object.defineProperty(process, 'platform', {value:'win32'});
    process.env.SystemRoot='C:\\\\Windows';
    let failure=false;
    childProcess.execFile=(command,args,options,callback)=>{
      assert.equal(command,'C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe');
      assert.equal(options.timeout,30000);
      assert.deepEqual(options.env,{SystemRoot:'C:\\\\Windows'});
      assert.ok(!args.join(' ').includes('private-input'));
      const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
      assert.ok(script.includes('ReadToEnd()'));
      const stdin=new EventEmitter();
      stdin.end=(value)=>{
        assert.equal(value,Buffer.from('private-input').toString('base64'));
        queueMicrotask(()=>callback(failure?Error('private-input timeout'):null,failure?'':'b2s='));
      };
      return {stdin};
    };
    syncBuiltinESMExports();
    const {cliDpapi}=await import(${JSON.stringify(module)});
    assert.equal((await cliDpapi('Protect',Buffer.from('private-input'))).toString(),'ok');
    failure=true;
    await assert.rejects(cliDpapi('Unprotect',Buffer.from('private-input')), {message:'LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE'});
  `)
  child.stdin.end()
  const [code, output, errors] = await Promise.all([child.exited,
    new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect(code, output + errors).toBe(0)
})

test("PowerShell module isolation precedes the caller script", () => {
  const args = windowsPowerShellArguments("[Console]::Out.Write('test')")
  expect(args.slice(0, -1)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"])
  expect(Buffer.from(args.at(-1)!, "base64").toString("utf16le")).toBe(
    "$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')\n[Console]::Out.Write('test')",
  )
})

test.skipIf(process.platform !== "win32")(
  "native commands use only built-in Windows modules",
  () => {
    const root = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!root) throw Error("SystemRoot required")
    const result = spawnSync(
      win32.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      windowsPowerShellArguments(`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
if (@(Get-Process).Count -eq 0) { exit 1 }
[Console]::Out.Write($env:PSModulePath)
`),
      {
        env: { SystemRoot: root, PSModulePath: "C:\\untrusted-modules" },
        windowsHide: true,
        timeout: WINDOWS_POWERSHELL_TIMEOUT_MS,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout.toLowerCase()).toBe(win32.join(root, "System32/WindowsPowerShell/v1.0/Modules").toLowerCase())
  },
  WINDOWS_POWERSHELL_TIMEOUT_MS + 5000,
)

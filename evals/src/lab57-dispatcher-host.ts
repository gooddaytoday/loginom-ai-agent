import { createRequire } from "node:module"
import path from "node:path"
import { readFile, lstat, readlink, realpath, readdir, open } from "node:fs/promises"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import {assertClosedNativePermit} from "./lab57-native-permit"

type DiagnosticSession={directory:string;browserCli:string;browserConfig:string}
type DiagnosticConfig={browser?:{browserName?:string;initScript?:string[];contextOptions?:{viewport?:{width:number;height:number}};
  userDataDir?:string;launchOptions?:{headless?:boolean;chromiumSandbox?:boolean;args?:string[];executablePath?:string}}}
export function validateDispatcherLaunch(session:DiagnosticSession,config:DiagnosticConfig) {
  const root="/home/user/.local/share/loginom-evals-runtime/cli-rich-startup-proposal-d6fc9c9b7b499d0a182c972815913b541e4cb81b"
  const client=path.join(root,"resources/loginom/runtime/client"),launch=config.browser?.launchOptions
  if(session.browserCli!==path.join(client,"node_modules/@playwright/mcp/cli.js") || !path.isAbsolute(session.directory) || session.directory.includes("/roles/ben/")
    || session.browserConfig!==path.join(session.directory,"playwright.json") || config.browser?.userDataDir!==path.join(session.directory,"browser-profile")
    || config.browser?.browserName!=="chromium" || launch?.headless!==true || launch.chromiumSandbox!==true
    || launch.executablePath!==path.join(root,"resources/loginom/browsers/chromium-1243/chrome-linux64/chrome")
    || JSON.stringify(launch.args)!==JSON.stringify(["--no-proxy-server"])
    || Object.keys(launch).some(k=>!["headless","chromiumSandbox","executablePath","args"].includes(k))
    || Object.keys(config.browser!).some(k=>!["browserName","userDataDir","initScript","launchOptions","contextOptions"].includes(k))
    || (config.browser!.contextOptions && Object.keys(config.browser!.contextOptions).some(k=>k!=="viewport")))throw Error("SANDBOX_OR_PROFILE_CHANGED")
}

/** Connects the exact d6 managed browser MCP using its public SDK, ONLY in a later admitted recovery.
 * Does not log in, load an old profile, create a lease, or acknowledge a recovery journal. */
export async function connectDispatcherMcp(session: {directory: string; browserCli: string; browserConfig: string},
  assertOriginalAdmissionAndRecoveryOnce: () => Promise<unknown>,diagnostics?:{directory:string;sandbox:true}) {
  const admit=async()=>{const permit=await assertOriginalAdmissionAndRecoveryOnce();if(diagnostics)assertClosedNativePermit(permit,session.directory)}
  if(diagnostics&&diagnostics.directory!==session.directory)throw Error("OWN_DIAGNOSTIC_OUTPUT_REQUIRED")
  await admit()
  const root = "/home/user/.local/share/loginom-evals-runtime/cli-rich-startup-proposal-d6fc9c9b7b499d0a182c972815913b541e4cb81b"
  const client = path.join(root,"resources/loginom/runtime/client")
  const manifestBytes=await readFile(path.join(root,"cli-manifest.json"))
  if (createHash("sha256").update(manifestBytes).digest("hex")!=="71a239098deec163333f2d3515f3ba252144ae10f87d5c7ee6a81926541c1b98") throw Error("D6_MANIFEST_CHANGED")
  const manifest=JSON.parse(manifestBytes.toString()) as {files:{path:string;sha256:string;link?:string}[]}
  for(const f of manifest.files) {
    const file=path.join(root,f.path)
    if(!file.startsWith(root+"/") || f.path.split("/").includes(".."))throw Error("D6_PATH_CHANGED")
    if(f.link!==undefined){if(!((await lstat(file)).isSymbolicLink()) || await readlink(file)!==f.link)throw Error("D6_LINK_CHANGED")}
    else if(createHash("sha256").update(await readFile(file)).digest("hex")!==f.sha256)throw Error("D6_SOURCE_CHANGED")
  }
  if (process.versions.node!=="24.19.0" || !session.browserCli.startsWith(client+"/node_modules/")
    || !path.isAbsolute(session.directory) || session.directory.includes("/roles/ben/")
    || session.browserConfig!==path.join(session.directory,"playwright.json")) throw Error("NEW_DIAGNOSTIC_SESSION_REQUIRED")
  const info=await lstat(session.directory)
  if(!info.isDirectory() || info.isSymbolicLink() || info.uid!==process.getuid!() || (info.mode&0o777)!==0o700
    || await realpath(session.directory)!==session.directory)throw Error("PRIVATE_DIAGNOSTIC_SESSION_REQUIRED")
  const config=JSON.parse(await readFile(session.browserConfig,"utf8")) as DiagnosticConfig
  validateDispatcherLaunch(session,config)
  const script=path.join(session.directory,"browser-downloads.js")
  if(JSON.stringify(config.browser?.initScript)!==JSON.stringify([script]))throw Error("OWN_INIT_SCRIPT_REQUIRED")
  const scriptInfo=await lstat(script)
  const {browserDownloadScript}=await import(pathToFileURL(path.join(client,"lib/browser-downloads.mjs")).href) as {browserDownloadScript(url:string):string}
  if(!scriptInfo.isFile() || scriptInfo.isSymbolicLink() || scriptInfo.uid!==process.getuid!() || (scriptInfo.mode&0o777)!==0o600
    || await readFile(script,"utf8")!==browserDownloadScript("http://localhost/app/"))throw Error("OWN_INIT_SCRIPT_CHANGED")
  const profile=path.join(session.directory,"browser-profile"),profileInfo=await lstat(profile)
  if(!profileInfo.isDirectory() || profileInfo.isSymbolicLink() || profileInfo.uid!==process.getuid!() || (profileInfo.mode&0o777)!==0o700
    || await realpath(profile)!==profile || (await readdir(profile)).length!==0)throw Error("FRESH_EMPTY_DIAGNOSTIC_PROFILE_REQUIRED")
  const require=createRequire(path.join(client,"package.json"))
  type McpClient={connect(t:unknown):Promise<void>;listTools():Promise<{tools:{name:string}[]}>;
    callTool(r:{name:"browser_run_code_unsafe";arguments:{code:string}},options?:unknown,timeout?:{timeout:number}):Promise<unknown>;close():Promise<void>}
  const {Client}=require("@modelcontextprotocol/sdk/client/index.js") as {Client:new(i:{name:string;version:string})=>McpClient}
  const {StdioClientTransport}=require("@modelcontextprotocol/sdk/client/stdio.js") as {StdioClientTransport:new(i:{command:string;args:string[];cwd:string;env:Record<string,string>;stderr:"pipe"})=>{stderr?:{on(name:string,callback:(data:Uint8Array)=>void):void};onclose?:()=>void}}
  await admit()
  const stderr=diagnostics?await open(session.directory+"/private-browser-stderr.txt","wx",0o600):null
  const boundary=diagnostics?["--unshare-user","--unshare-pid","--unshare-ipc","--die-with-parent","--new-session","--ro-bind","/usr","/usr",
    "--symlink","usr/bin","/bin","--symlink","usr/lib","/lib","--symlink","usr/lib64","/lib64","--proc","/proc","--dev","/dev","--tmpfs","/tmp","--tmpfs","/dev/shm",
    "--ro-bind",root,root,"--bind",session.directory,session.directory,"--chdir",session.directory,
    ...["/etc/ld.so.cache","/etc/nsswitch.conf","/etc/resolv.conf","/etc/hosts","/etc/passwd","/etc/group","/etc/fonts","/etc/ssl/certs"].flatMap(f=>["--ro-bind",f,f]),
    "--",process.execPath,session.browserCli,"--config",session.browserConfig]:[session.browserCli,"--config",session.browserConfig]
  const transport=new StdioClientTransport({command:diagnostics?"/usr/bin/bwrap":process.execPath,args:boundary,cwd:session.directory,
    env:{PATH:"/usr/bin:/bin",TMPDIR:"/tmp"},stderr:"pipe"})
  let pending=Promise.resolve(),terminated=false
  transport.onclose=()=>{terminated=true}
  // Raw lower causes are retained ONLY in a private observer file, outside deliveries/model mounts.
  transport.stderr?.on("data",data=>{if(stderr)pending=pending.then(async()=>{await stderr.write(data)})})
  const mcp=new Client({name:"lab57-owned-dispatcher",version:"1"})
  await admit()
  try {
    await mcp.connect(transport)
    if(!(await mcp.listTools()).tools.some(t=>t.name==="browser_run_code_unsafe"))throw Error("PINNED_BROWSER_TOOL_UNAVAILABLE")
  } catch(error) {
    if(stderr){await pending;await stderr.write(String(error));await stderr.sync()}
    await admit();await mcp.close().catch(()=>{})
    await pending;if(stderr)await stderr.close()
    // Protocol close is not a process/server cleanup attestation. The admitted supervisor must settle it.
    throw Error("DISPATCHER_CONNECT_UNCONFIRMED")
  }
  return {callTool:async(r:{name:"browser_run_code_unsafe";arguments:{code:string}})=>{
    await admit();return mcp.callTool(r,undefined,{timeout:90000})
  },close:async()=>{await admit();await mcp.close();await pending;
    if(stderr){await stderr.sync();await stderr.close()}
    if(diagnostics&&!terminated)throw Error("DIAGNOSTIC_STDIO_TERMINATION_UNCONFIRMED")
    return {browserTransportClosed:true,browserProcessTerminated:terminated}}}
}

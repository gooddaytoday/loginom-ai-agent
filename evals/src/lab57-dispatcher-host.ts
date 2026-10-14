import { createRequire } from "node:module"
import path from "node:path"
import { readFile, lstat, readlink } from "node:fs/promises"
import { createHash } from "node:crypto"

/** Connects the exact d6 managed browser MCP using its public SDK, ONLY in a later admitted recovery.
 * Does not log in, load an old profile, create a lease, or acknowledge a recovery journal. */
export async function connectDispatcherMcp(session: {directory: string; browserCli: string; browserConfig: string},
  assertOriginalAdmissionAndRecoveryOnce: () => Promise<void>) {
  await assertOriginalAdmissionAndRecoveryOnce()
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
  if(!info.isDirectory() || info.isSymbolicLink() || info.uid!==process.getuid!() || (info.mode&0o777)!==0o700)throw Error("PRIVATE_DIAGNOSTIC_SESSION_REQUIRED")
  const config=JSON.parse(await readFile(session.browserConfig,"utf8")) as {browser?:{userDataDir?:string;launchOptions?:{headless?:boolean;chromiumSandbox?:boolean;args?:string[];executablePath?:string}}}
  const launch=config.browser?.launchOptions
  if(config.browser?.userDataDir!==path.join(session.directory,"browser-profile") || launch?.headless!==true
    || launch.chromiumSandbox!==true || !launch.executablePath?.startsWith(root+"/resources/")
    || launch.args?.some(a=>/no-sandbox|disable-setuid-sandbox|remote-debugging/.test(a)))throw Error("SANDBOX_OR_PROFILE_CHANGED")
  const require=createRequire(path.join(client,"package.json"))
  type McpClient={connect(t:unknown):Promise<void>;listTools():Promise<{tools:{name:string}[]}>;
    callTool(r:{name:"browser_run_code_unsafe";arguments:{code:string}},options?:unknown,timeout?:{timeout:number}):Promise<unknown>;close():Promise<void>}
  const {Client}=require("@modelcontextprotocol/sdk/client/index.js") as {Client:new(i:{name:string;version:string})=>McpClient}
  const {StdioClientTransport}=require("@modelcontextprotocol/sdk/client/stdio.js") as {StdioClientTransport:new(i:{command:string;args:string[];cwd:string;env:Record<string,string>;stderr:"pipe"})=>{stderr?:{on(name:string,callback:()=>void):void}}}
  const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,"--config",session.browserConfig],cwd:session.directory,
    env:{PATH:"/usr/bin:/bin",TMPDIR:"/tmp"},stderr:"pipe"})
  // Browser stderr can contain page details; it is never forwarded to a safe receipt.
  transport.stderr?.on("data",()=>{})
  const mcp=new Client({name:"lab57-owned-dispatcher",version:"1"})
  await assertOriginalAdmissionAndRecoveryOnce()
  try {
    await mcp.connect(transport)
    if(!(await mcp.listTools()).tools.some(t=>t.name==="browser_run_code_unsafe"))throw Error("PINNED_BROWSER_TOOL_UNAVAILABLE")
  } catch {
    await mcp.close().catch(()=>{})
    // Protocol close is not a process/server cleanup attestation. The admitted supervisor must settle it.
    throw Error("DISPATCHER_CONNECT_UNCONFIRMED")
  }
  return {callTool:async(r:{name:"browser_run_code_unsafe";arguments:{code:string}})=>{
    await assertOriginalAdmissionAndRecoveryOnce();return mcp.callTool(r,undefined,{timeout:90000})
  },close:()=>mcp.close()}
}

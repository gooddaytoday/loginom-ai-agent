import type {ProcessCleanup} from "./process-supervisor"

/** Structural screening complements the unchanged supervisor's private raw capture and fresh host absence. */
export function verifyClosedProcessCapture(p:ProcessCleanup,node:{path:string;device:number;inode:number},directory:string,acquiredAt:string) {
  const fail=():never=>{throw Error("CLOSED_NATIVE_CAPTURE_REQUIRED")}
  const time=(s:string)=>Date.parse(s)
  if(!p||p.status!=="confirmed"||p.error!==null||p.observation_mode!=="continuous"||p.capture_complete!==true
    ||!Array.isArray(p.unknownProcesses)||p.unknownProcesses.length||!p.launcher?.ready||!p.processes?.length
    ||!p.origins||!p.admissions||p.origins.length!==p.processes.length||p.admissions.length!==p.processes.length
    ||p.selectedCli?.executable!==node.path||p.selectedCli.device!==node.device||p.selectedCli.inode!==node.inode
    ||JSON.stringify(p.runtimeDirectories)!==JSON.stringify([directory])||!p.browserBindings?.length||p.bindingRefusals?.length
    ||p.verification?.length!==2||p.verification.some(v=>v.owned_remaining!==0||!Number.isFinite(time(v.observed_at))||time(v.observed_at)<time(acquiredAt))
    ||time(p.verification[1]!.observed_at)<=time(p.verification[0]!.observed_at))fail()
  const keys=new Set(p.processes.map(v=>`${v.pid}:${v.starttime}`))
  if(keys.size!==p.processes.length)fail()
  for(const v of p.processes){
    if(!Number.isSafeInteger(v.pid)||v.pid<=0||v.uid!==process.getuid!()||!/^\d+$/.test(v.starttime)||v.device<=0||v.inode<=0||v.group<=0||v.session<=0
      ||p.admissions!.filter(a=>a.pid===v.pid&&a.starttime===v.starttime&&a.status==="allowed").length!==1
      ||p.origins!.filter(o=>o.pid===v.pid&&o.starttime===v.starttime).length!==1)fail()
    const seen=new Set<string>();let key:string|undefined=`${v.pid}:${v.starttime}`
    while(key){
      if(seen.has(key))fail();seen.add(key)
      const o=p.origins!.find(o=>`${o.pid}:${o.starttime}`===key)
      if(!o)return fail()
      if(!Number.isFinite(time(o.observed_at))||time(o.observed_at)<time(acquiredAt))fail()
      if(o.via==="launcher"){if(o.pid!==p.launcher!.pid||o.parent_pid!==null||o.parent_starttime!==null)fail();key=undefined;continue}
      key=`${o.parent_pid}:${o.parent_starttime}`
      if(!["cli","parent","subreaper"].includes(o.via)||!keys.has(key))fail()
    }
  }
  const cli=p.processes.find(v=>v.pid===p.launcher!.cli_pid)
  if(!cli||cli.executable!==node.path||cli.device!==node.device||cli.inode!==node.inode||p.origins!.find(o=>o.pid===cli.pid)?.via!=="cli")fail()
  for(const b of p.browserBindings!){
    const v=p.processes.find(v=>v.pid===b.process.pid&&v.starttime===b.process.starttime)
    if(!v||JSON.stringify(v)!==JSON.stringify(b.process)||b.runtimeDirectory!==directory||!Number.isFinite(time(b.observed_at))||time(b.observed_at)<time(acquiredAt))fail()
  }
}

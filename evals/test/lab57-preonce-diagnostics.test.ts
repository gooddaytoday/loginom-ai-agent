import {test,expect} from "bun:test"
import {mkdtemp,chmod,readFile,readdir,lstat} from "node:fs/promises"
import {privateDiagnosticRun} from "../src/lab57-preonce-diagnostics"
import {routeCommand} from "../src/lab57-route-host"
test("pre-once EACCES has a durable private reason without effects or credential text",async()=>{
 const root=await mkdtemp("/tmp/lab57-preonce-");await chmod(root,0o700);let effects=0
 const original=Object.assign(new Error("password=private-value, full-env, /private/profile"),{code:"EACCES"})
 await expect(privateDiagnosticRun(root,{issue:"LAB-57",sourceSha:"a".repeat(40)},async stage=>{await stage("fresh-guard");throw original;effects++})).rejects.toBe(original)
 const files=await readdir(root);expect(files).toContain("refusal.json")
 const raw=await readFile(root+"/refusal.json","utf8"),proof=JSON.parse(raw)
 expect(proof.stage).toBe("fresh-guard");expect(proof.exception.name).toBe("Error");expect(proof.exception.code).toBe("EACCES")
 expect(raw).not.toContain("private-value");expect(raw).not.toContain("full-env");expect(effects).toBe(0)
 expect((await lstat(root+"/refusal.json")).mode&0o777).toBe(0o600)
 await expect(privateDiagnosticRun(root,{},async()=>{})).rejects.toThrow()
})
test("genuine subprocess Python EACCES survives the wrapper as redacted pre-once cause",async()=>{
 const root=await mkdtemp("/tmp/lab57-lower-");await chmod(root,0o700)
 await expect(privateDiagnosticRun(root,{sourceOnly:true},async stage=>{await stage("observer");await routeCommand("/usr/bin/python3",["-c","raise PermissionError(13, 'private-value')"])})).rejects.toThrow("OWNED_COMMAND_FAILED")
 const raw=await readFile(root+"/refusal.json","utf8"),proof=JSON.parse(raw)
 expect(proof.exception.cause.name).toBe("PermissionError");expect(proof.exception.cause.code).toBe("EACCES");expect(raw).not.toContain("private-value")
})
test("private pre-once journal rejects permissive root, existing records and symlink",async()=>{
 const root=await mkdtemp("/tmp/lab57-unsafe-");await chmod(root,0o755)
 await expect(privateDiagnosticRun(root,{},async()=>{})).rejects.toThrow("PRIVATE_RECORD_ROOT")
 await chmod(root,0o700)
 const {symlink}=await import("node:fs/promises");await symlink(root,root+"-alias")
 await expect(privateDiagnosticRun(root+"-alias",{},async()=>{})).rejects.toThrow("PRIVATE_RECORD_PATH")
})
test("privileged producer's capability gate survives before once; arbitrary messages remain redacted",async()=>{
 const root=await mkdtemp('/tmp/lab57-cap-source-');await chmod(root,0o700)
 const script="import json,sys;print('LAB57_FD_REFUSAL '+json.dumps({'name':'ObserverRefused','code':None,'gate':'FD_OBSERVER_CAPABILITY_REQUIRED'}),file=sys.stderr);raise RuntimeError('FD_OBSERVER_REFUSED')"
 await expect(privateDiagnosticRun(root,{sourceOnly:true},async stage=>{await stage('observer');await routeCommand('/usr/bin/python3',['-c',script])})).rejects.toThrow('OWNED_COMMAND_FAILED')
 const proof=JSON.parse(await readFile(root+'/refusal.json','utf8'));expect(proof.exception.cause.cause.name).toBe('ObserverRefused')
 expect(proof.exception.cause.cause.reason).toBe('FD_OBSERVER_CAPABILITY_REQUIRED')
})

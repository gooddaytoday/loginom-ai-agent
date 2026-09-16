#!/usr/bin/env node
// Operator-only local browser test. No Loginom, model, remote Dock or user files.
import {mkdtemp,mkdir,readFile,writeFile,rm,open} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createArtifactStore} from '../../client/lib/artifacts.mjs';

process.umask(0o077);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const browsers=resolve(process.argv[2]);
const output=resolve(process.argv[3]);
const require=createRequire(join(root,'client/package.json'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let client,store,scratch,reportFile,closed=false,stage='runtime_preflight';
const report={scope:'local_browser_file_input_and_download_only',loginom_accessed:false,model_started:false,passed:false};
const parseResult=response=>{
  if(response.isError)throw new Error('Browser operation failed');
  for(const block of response.content??[])if(block.type==='text') {
    const match=block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);
    if(match)return JSON.parse(match[1]);
  }
  throw new Error('Browser result missing');
};
try {
  report.dependencies=JSON.parse(execFileSync(process.execPath,[join(root,'tools/loginom-acceptance/runtime-check.mjs'),root,browsers],{encoding:'utf8'}));
  report.source_sha256={};
  for(const path of ['client/lib/artifacts.mjs','tools/loginom-acceptance/artifact-transport-check.mjs'])
    report.source_sha256[path]=sha(await readFile(join(root,path)));
  stage='local_fixture';
  await mkdir(dirname(output),{recursive:true,mode:0o700});
  reportFile=await open(output,'wx',0o600);
  scratch=await mkdtemp(join(dirname(output),'private-transfer-'));
  const sourcePath=join(scratch,'synthetic-source'),payload=Buffer.from('Id;Value\n1;42\n');
  await writeFile(sourcePath,payload,{mode:0o600});
  store=await createArtifactStore({directory:join(scratch,'input')});
  const descriptor=await store.admit({sourcePath,name:'Продажи.csv',bytes:payload.length,sha256:sha(payload)});
  const lease=await store.stageUpload(descriptor.artifact_id);await lease.verify();
  process.env.PLAYWRIGHT_BROWSERS_PATH=browsers;
  const {chromium}=require('playwright-core');
  const config=join(scratch,'browser.json');
  await writeFile(config,JSON.stringify({browser:{browserName:'chromium',userDataDir:join(scratch,'profile'),
    launchOptions:{executablePath:chromium.executablePath(),headless:true}},saveSession:false,outputDir:join(scratch,'browser-output')}));
  client=new Client({name:'dock-local-artifact-transport-check',version:'1'});
  stage='browser_connect';
  const transport=new StdioClientTransport({command:process.execPath,args:[join(dirname(require.resolve('@playwright/mcp/package.json')),'cli.js'),'--config',config],
    env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:browsers},stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  await client.connect(transport,{timeout:60000});
  stage='file_input';
  // Only the private staged path crosses the code channel, never file bytes.
  const code=`async page => {
    await page.setContent('<input id="file" type="file">');
    await page.locator('#file').setInputFiles(${JSON.stringify(lease.path)});
    return page.locator('#file').evaluate(async input => {
      const file=input.files[0];return {name:file.name,size:file.size,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))};
    });
  }`;
  const response=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
  const selected=parseResult(response);
  if(!selected || selected.name!==descriptor.name || selected.size!==descriptor.bytes || sha(Buffer.from(selected.bytes))!==descriptor.sha256)
    throw new Error('Selected file differs from admitted artifact');
  await lease.verify();
  report.file={name:descriptor.name,bytes:descriptor.bytes,sha256:descriptor.sha256};
  report.payload_embedded_in_code=code.includes(payload.toString('base64'))||code.includes(payload.toString());
  if(report.payload_embedded_in_code)throw new Error('Payload leaked into code');
  stage='download';
  const downloadLease=await store.stageDownload(descriptor.artifact_id);
  // The browser creates a Blob from its selected synthetic File. Return only
  // event metadata; the host reads Download.saveAs output for the byte proof.
  const downloadCode=`async page => {
    await page.locator('#file').evaluate(input => {
      const file=input.files[0],link=document.createElement('a');
      link.id='download';link.download=file.name;link.href=URL.createObjectURL(file);
      link.textContent='Download';document.body.appendChild(link);
    });
    const event=page.waitForEvent('download',{timeout:15000});
    const [download]=await Promise.all([event,page.locator('#download').click()]);
    await download.saveAs(${JSON.stringify(downloadLease.path)});
    const failure=await download.failure();
    if(failure!==null)throw new Error('Synthetic download failed');
    return {suggested_name:download.suggestedFilename(),completed:true};
  }`;
  const downloaded=parseResult(await client.callTool({name:'browser_run_code_unsafe',arguments:{code:downloadCode}},undefined,{timeout:60000}));
  if(downloaded.completed!==true)throw new Error('Download completion missing');
  await downloadLease.verify(downloaded.suggested_name);
  report.download={suggested_name:downloaded.suggested_name,bytes:descriptor.bytes,sha256:descriptor.sha256,host_bytes_verified:true};
  report.download_payload_embedded_in_code=downloadCode.includes(payload.toString('base64'))||downloadCode.includes(payload.toString());
  if(report.download_payload_embedded_in_code)throw new Error('Download payload leaked into code');
  stage='browser_close';await client.close();closed=true;
  const released=await store.releaseUploads();
  if(released.some(result=>result.status!=='fulfilled'))throw new Error('Transfer cleanup failed');
  report.passed=true;
} catch {report.failed_stage=stage;process.exitCode=1;}
finally {
  if(client && !closed)try{await client.close();closed=true;}catch{}
  if(closed && store)await store.releaseUploads();
  if(scratch && (!client || closed))await rm(scratch,{recursive:true,force:true});
  if(reportFile){await reportFile.writeFile(JSON.stringify(report,null,2)+'\n');await reportFile.close();}
  process.stdout.write(JSON.stringify(report)+'\n');
}

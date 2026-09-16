import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const config=JSON.parse(process.argv[2]);const client=new Client({name:'node-target-precheck',version:'1'});
try{await client.connect(new StdioClientTransport({...config,env:{...getDefaultEnvironment(),...config.env},stderr:'pipe'}));const result=await client.listTools();if(result.tools.length!==5)throw new Error('Unexpected acceptance surface');const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:90000});return JSON.parse(r.content[0].text);};
 const prep=await call('dock_prepare');if(prep.status!=='READY')throw new Error('Preparation smoke failed');
 const created=await call('node_target',{operation_id:'smoke',request:{document_id:prep.document_id,workflow_ref:prep.workflow_ref,target:{kind:'new',type:'imports.text',label:'Smoke',position:{x:320,y:280}},inputs:[]}});if(created.status!=='SUCCEEDED')throw new Error('Graph operation smoke failed: '+JSON.stringify(created));
 const observed=await call('graph_observe');if(observed.nodes.length!==1||observed.nodes[0].label!=='Smoke'||!(observed.nodes[0].position.width>0))throw new Error('Independent read smoke failed');
 console.log(JSON.stringify({passed:true,tools:result.tools.map(t=>t.name),observed}));}finally{await client.close();}

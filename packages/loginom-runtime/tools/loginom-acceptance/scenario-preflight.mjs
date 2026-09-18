// Discover the isolated native MCP before spending a model run. No task is prepared.
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const [launcher,packagePath]=process.argv.slice(2);
const client=new Client({name:'corpus-preflight',version:'1'});
const transport=new StdioClientTransport({command:launcher,args:['mcp','hermes','mimo-stability','--acceptance-cleanup-package',packagePath],env:getDefaultEnvironment(),stderr:'pipe'});
transport.stderr.on('data',()=>{});
try{
 await client.connect(transport);
 const {tools}=await client.listTools();
 for(const name of ['dock_prepare','dock_node_apply','dock_artifact_deliver'])
  if(!tools.some(t=>t.name===name))throw Error('Required isolated Dock tool unavailable: '+name);
 console.log(JSON.stringify({stage:'mcp_preflight_passed',tools:tools.length}));
}finally{await client.close();}

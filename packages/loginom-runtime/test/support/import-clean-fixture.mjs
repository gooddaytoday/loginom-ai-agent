import vm from 'node:vm';
export function cleanFixture(readImportCleanFacts,{change,modified=false,lastProvider}={}){
 const identity={session_id:'session',document_id:'doc',workflow_id:'wf',node_id:'node',account:'account',package_path:'/account/left.lgp',tab_tid:'tab',loginom_build:'7.4.2',read_started_at:Date.now()};
 const events=[],tab={classList:{contains:()=>true}},doc={querySelectorAll:selector=>selector.includes('data-tid')?[tab]:[]};
 const pack={PackageFileName:identity.package_path,Package:{},HasRunningNodes(){events.push('running-package');return false;}};
 const workflow={ParentNode:pack},nativeNode={ParentNode:workflow,FGuid:'node',FModelNode:{}},card={Controller:{Node:{data:{node:nativeNode}},FController:{FModelNode:nativeNode.FModelNode}}};
 const workspace={getActiveTab(){lastProvider?.(f);return card;}},session={async IsPackageModified(){events.push('modified');change?.(f);return modified;}};
 const inventory={Count:1,Items:()=>pack},connection={Session:session,UserName:'account',Connected:true};
 const map={PackageNodes:inventory,FServerConnection:connection,HasRunningNodes:()=>false},main={FMapTree:map,Items:{Workspace:workspace}};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:main}}};
 const receipt={phase:'verified',request:JSON.stringify({session:'session'}),workflowId:'wf',packageNode:pack,nodeTargetWorkflowNode:workflow,tab};
 const prep={document:doc,id:'doc',receipts:new Map([['synthetic-only',receipt]])};
 const sandbox={bg:{app},document:doc,__loginomDockPreparationV1:prep,Map,Date,getComputedStyle:()=>({visibility:'visible'})};
 const f={identity,events,pack,workflow,nativeNode,card,workspace,session,inventory,connection,map,main,app,receipt,prep,sandbox};
 f.read=async()=>JSON.parse(JSON.stringify(await vm.runInNewContext('('+readImportCleanFacts.toString()+')',sandbox)(identity)));return f;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readJavascriptServerVersion} from './javascript-server-version.mjs';

function fixture(isWindows,{foreign=false,replaceHome=false}={}) {
  class HomePageTreeNode {}
  const home=new HomePageTreeNode(),connection={Connected:true,UserName:foreign?'other':'jsteach'};
  const tab={Controller:{Node:{data:{node:home}}}},workspace={getActiveTab:()=>tab};
  const main={FMapTree:{FServerConnection:connection,PackageNodes:{Count:0}},Items:{Workspace:workspace}};
  const app={Version:'7.4.2',Application:{FInstance:{FMainForm:main}}};
  let selected=false,calls=0;
  const version={PlatformEdition:'Enterprise'};
  Object.defineProperty(version,'IsWindows',{get(){assert.equal(selected,true);return isWindows;}});
  connection.Session={Version:version};
  const bg={app,select:(value,selector)=>selector(value),selectAsyncValue:async(source,selector,callback)=>{
    calls++;selected=true;selector(source);callback(source);selected=false;
    if(replaceHome)tab.Controller.Node.data.node=new HomePageTreeNode();
  }};
  return {read:runInNewContext('('+readJavascriptServerVersion.toString()+')',{bg}),calls:()=>calls};
}

test('server OS comes from selected owned Session.Version, not browser platform',async()=>{
  for(const [isWindows,expected] of [[false,'Linux'],[true,'Windows']]){
    const f=fixture(isWindows);
    const result=await f.read({account:'jsteach',build:'7.4.2'});
    assert.equal(result.status,'observed');assert.equal(result.server_os,expected);
    assert.equal(result.edition,'Enterprise');assert.equal(f.calls(),1);
  }
});

test('foreign account and changed home refuse server OS attribution',async()=>{
  const foreign=fixture(false,{foreign:true});
  assert.equal((await foreign.read({account:'jsteach',build:'7.4.2'})).status,'refused');
  assert.equal(foreign.calls(),0);
  const changed=fixture(false,{replaceHome:true});
  assert.equal((await changed.read({account:'jsteach',build:'7.4.2'})).reason,'owned_home_session_changed');
  assert.equal(changed.calls(),1);
});

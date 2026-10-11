import {loginOwnPage, logoutOwnPage, readOwnClient} from './account-session-ui.mjs';
import {installNativeLifetime, nativePositive, nativeSnapshot} from './native-lifetime.mjs';
import {verifyCausalCapture} from './account-identity.mjs';
import {requireFixedHarness} from './capture-harness.mjs';
import {tid, suffix, uniqueVisible, navigate, ready} from './account-ui.mjs';
import {accountPolicy} from './account-lifecycle.mjs';

// Separate technical admin policy; the Worker/Reviewer accountPolicy is unchanged.
export const cardAdminPolicy = Object.freeze({...accountPolicy, chkDesigner:false, chkViewer:false, chkAdmin:true});
const form='UserListForm;UserForm;';
const fail=code=>{throw Object.assign(Error(code),{code});};

export async function inspectOrCreateAdmin(page, config, intent, diagnostics, currentBootstrap) {
  await navigate(page,'Пользователи',diagnostics);
  const row=suffix('UserListForm;cntTile;ListView;headercontainer;title_'+config.loginom.username);
  const rows=page.locator(row);
  if (await rows.count()>1) fail('UI_TARGET_AMBIGUOUS');
  const field=async name=>{const input=(await uniqueVisible(page,suffix(form+name))).locator('input');
    if (await input.count()!==1) fail('UI_TARGET_AMBIGUOUS');return input;};
  const act=(action,selector,fn)=>diagnostics.run('admin-provision',action,selector,fn);
  const read=async(strict=false)=>{
    if (await (await field('edtLogin')).inputValue()!==config.loginom.username
      || await (await field('edtFullName')).inputValue()!==intent.full_name
      || await (await field('cbxAuthMode')).inputValue()!=='Локальная') fail('CARD_ADMIN_OWNER_UNKNOWN');
    const policy={};for(const name of Object.keys(cardAdminPolicy)) policy[name]=await (await uniqueVisible(page,suffix(form+name))).evaluate(el=>el.classList.contains('x-form-cb-checked'));
    if (policy.chkAdmin!==true || policy.chkBlocked!==false || policy.chkMustChangePassword!==false
      || (strict && Object.entries(cardAdminPolicy).some(([k,v])=>policy[k]!==v))) fail('CARD_ADMIN_POLICY_UNKNOWN');
    return policy;
  };
  if (await rows.count()===0) {
    if (intent.action!=='create-unstarted' || intent.history?.state!=='NEVER_STARTED' || intent.history.prior_attempts?.length!==0)
      fail('CARD_ADMIN_ABSENT_RECONCILIATION_REQUIRED');
    diagnostics.events.push({phase:'admin-provision',action:'immutable-create-intent',state:'UNKNOWN',intent});diagnostics.save();
    await act('add',suffix('UserListForm;btnAdd'),async()=> (await uniqueVisible(page,suffix('UserListForm;btnAdd'))).click({timeout:diagnostics.remaining()}));
    await ready(page,diagnostics);
    for(const [name,value] of [['edtLogin',config.loginom.username],['edtFullName',intent.full_name],['edtPassword',config.loginom.password]])
      await act('fill-'+name,suffix(form+name),async()=>{const input=await field(name);await input.click({timeout:diagnostics.remaining()});await input.fill(value,{timeout:diagnostics.remaining()});});
    if (await (await field('cbxAuthMode')).inputValue()!=='Локальная') fail('UNEXPECTED_AUTH_MODE');
    for(const [name,desired] of Object.entries(cardAdminPolicy)) {
      const control=await uniqueVisible(page,suffix(form+name));
      if (await control.evaluate(el=>el.classList.contains('x-form-cb-checked'))!==desired)
        await act('set-'+name,suffix(form+name+';DisplayEl'),async()=> (await uniqueVisible(page,suffix(form+name+';DisplayEl'))).click({timeout:diagnostics.remaining()}));
    }
    await read(true);await currentBootstrap();
    await act('apply',suffix(form+'btnApply'),async()=> (await uniqueVisible(page,suffix(form+'btnApply'))).click({timeout:diagnostics.remaining()}));
    await act('wait-applied',suffix(form+'edtLogin'),()=>page.locator(suffix(form+'edtLogin')).waitFor({state:'hidden',timeout:diagnostics.remaining()}));
  }
  await act('reopen-existing',row,async()=> (await uniqueVisible(page,row)).dblclick({timeout:diagnostics.remaining()}));
  await ready(page,diagnostics);const policy=await read();
  // Existing rows are read/cancel only. No password, policy or fullname repair.
  await act('cancel',suffix(form+'btnCancel'),async()=> (await uniqueVisible(page,suffix(form+'btnCancel'))).click({timeout:diagnostics.remaining()}));
  await act('wait-cancel',suffix(form+'edtLogin'),()=>page.locator(suffix(form+'edtLogin')).waitFor({state:'hidden',timeout:diagnostics.remaining()}));
  return policy;
}

export async function adminBootstrapLifecycle({global,card,intent,operation,harness,diagnostics,openOwnPage}) {
  requireFixedHarness(harness);const actors=[],receipts=[];
  const fact=(action,value)=>{diagnostics.events.push({phase:'bootstrap',action,state:'UNKNOWN',value});diagnostics.save();};
  const session=async(operator,actorName,body)=>{
    const config={role:'admin',issue_id:operation.issue_id,loginom:{url:operator.url,username:operator.admin_user,password:operator.admin_password}};
    const token=await harness.before(config,'admin');
    const actor={page:await openOwnPage(operator.url),config,actorName,sockets:[]};actors.push(actor);
    actor.page.on('websocket',socket=>{const record={closed:false,errors:0};actor.sockets.push(record);socket.on('close',()=>record.closed=true);socket.on('socketerror',()=>record.errors++);});
    await actor.page.evaluate(installNativeLifetime);
    let client,proof,failure;
    try {
      await loginOwnPage(actor.page,config,diagnostics);await nativePositive(actor.page);
      const before=await readOwnClient(actor.page,config);fact('positive-connected',before);
      if (before.rights.chkAdmin!==true || before.rights.chkBlocked || before.rights.chkMustChangePassword) fail('CARD_EFFECTIVE_ADMIN_UNKNOWN');
      const observed=new Date().toISOString(),connectionReceipt=diagnostics.sha256;
      const capture=await harness.during(token);const after=await readOwnClient(actor.page,config);
      const native=await nativeSnapshot(actor.page),binding=capture.binding;
      const common=Object.fromEntries(['issue_id','operation_id','source_sha','nonce','config_sha256','role','user_hash'].map(k=>[k,binding[k]]));
      const continuity={transport_count:actor.sockets.length,disconnects:actor.sockets.filter(x=>x.closed||x.errors).length,
        reconnects:native.reconnect_count,native_lifetime:native,guard_audit:capture.guard_audit,account_lock:binding.account_lock,config_sha256:binding.config_sha256};
      fact('continuity',continuity);continuity.receipt_sha256=diagnostics.sha256;
      proof=verifyCausalCapture({...capture,childBefore:{...common,...before,observed_at:observed,connection_receipt_sha256:connectionReceipt},
        childAfter:{...common,...after,observed_at:new Date().toISOString(),connection_receipt_sha256:connectionReceipt,continuity}});
      client=after;fact('causal-admin-before-users',proof);
      await body(actor.page,config,async()=>{
        const current=await readOwnClient(actor.page,config);harness.guards();
        if(current.guid_hash!==client.guid_hash || current.rights.chkAdmin!==true) fail('CARD_EFFECTIVE_ADMIN_CHANGED');
      });
    } catch(error) {failure=error;}
    try {
      if(!client||!proof) fail('BOOTSTRAP_LOGOUT_IDENTITY_UNKNOWN');
      await actor.page.evaluate(()=>globalThis.__lab53NativeLifetime.beginLogout());
      const logout=await logoutOwnPage(actor.page,config,client,diagnostics);
      receipts.push({actor:actorName,role:'admin',effective_admin:true,effect:proof.effect,observer:proof.observer_positive,
        causal_proof_sha256:proof.proof_sha256,logout});harness.retired(proof.effect);
    } catch(error) {if(failure)failure.cleanup_error={code:error.code,message:error.message};else failure=error;}
    await actor.page.close();
    if(failure)throw failure;
  };
  try {
    await session(global,'bootstrap-admin',async(page,_config,recheck)=>inspectOrCreateAdmin(page,
      {loginom:{url:card.url,username:card.admin_user,password:card.admin_password}},intent,diagnostics,recheck));
    await session(card,'card-admin',async(page,config)=>{
      const current=await readOwnClient(page,config);
      if(current.rights.chkAdmin!==true||current.rights.chkBlocked||current.rights.chkMustChangePassword)fail('CARD_EFFECTIVE_ADMIN_UNKNOWN');
    });
    if(receipts.length!==2)fail('BOOTSTRAP_ALL_EFFECTS_UNKNOWN');return receipts;
  } finally {for(const actor of actors)if(!actor.page.isClosed())await actor.page.close();}
}

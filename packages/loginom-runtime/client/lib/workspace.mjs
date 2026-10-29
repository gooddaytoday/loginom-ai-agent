// Fixed local lifecycle code. Catalogs never supply executable bootstrap code.
async function prepareWorkspace(page, options) {
  const deadline = Date.now() + options.timeoutMs;
  let phase = 'page', createdDraft = false, effectPossible = options.recoverOnly === true, target = null;
  const trace = [];
  let authenticated = false;
  const remaining = () => {
    const now = Date.now();
    if (now >= deadline) throw new Error('DEADLINE');
    return deadline - now;
  };
  const tid = value => page.locator(`[data-tid=${JSON.stringify(value)}]`);
  const wait = async (name, probe) => {
    phase = name;
    while (remaining()) {
      const value = await probe();
      remaining();
      if(value?.pending===true) {
        const sample={condition:name,satisfied:false,blocking_windows:value.blocking_windows};
        if(trace.at(-1)?.condition===name&&trace.at(-1)?.satisfied===false)trace[trace.length-1]=sample;
        else trace.push(sample);
      } else if (value) { trace.push({ condition: name, satisfied: true,
        ...(value.blocking_windows?{blocking_windows:value.blocking_windows}:{}) }); return value; }
      await page.waitForTimeout(Math.min(100, remaining()));
    }
  };
  const result = (status, reason, extra = {}) => ({ status, reason, phase, target,
    authenticated, created_draft: createdDraft, effect_possible: effectPossible,
    operation_id: options.operationId, session_id: options.sessionId, trace, ...extra });
  const missingPackage = proof => result('NOT_READY','PACKAGE_OPEN_REJECTED',{
    ...proof, authenticated:true, effect_possible:false, package_absence_verified:true, package_path:options.packagePath,
    message:'The saved package does not exist. For a new task call dock_prepare with intent new_draft, a NEW operation_id and no package_path. Keep this same package path/name as the final Save destination. Do not stop the task or retry Open for this future Save path.',
    next_step:{tool:'dock_prepare',intent:'new_draft',new_operation_id_required:true,omit_package_path:true,save_path:options.packagePath},
  });
  // Cached Loginom getters, plus a read-only existence check before Open.
  // Never execute or mutate a package through native methods here.
  const inspect = async mode => page.evaluate(async ({ mode, options, deadline }) => {
    const key = '__loginomDockPreparationV1';
    let state = globalThis[key];
    if (!state || state.document !== document) state = globalThis[key] = {
      document, id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, receipts: new Map(),
    };
    // Match workspace-ui: only this preparation's exact native-hidden picker
    // is inactive. Offscreen geometry alone never waives an active dialog.
    const inactivePicker = e => {
      if(e?.getAttribute('data-tid')!=='OpenDialogForm')return false;
      const component=globalThis.Ext?.getCmp?.(e.id);
      return state.document===document && component?.$className==='bg.filedialog.view.OpenDialogForm'
        && component.el?.dom===e && [...state.receipts.values()].some(r=>r.openDialogElement===e&&r.openDialog===component)
        && component.hidden===true;
    };
    const visible = e => !!e && !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height
      && getComputedStyle(e).visibility !== 'hidden' && !inactivePicker(e.closest?.('[data-tid="OpenDialogForm"]')??e);
    const allTabs = [...document.querySelectorAll('[data-tid^="MF;cntMain;cntWorkspace;Workspace;t.br;tb"]')];
    const tabs = allTabs.filter(e => /^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(e.getAttribute('data-tid')));
    const active = tabs.filter(e => e.classList.contains('x-tab-active'));
    const tab = active.length === 1 ? active[0] : null;
    const tabTid = tab?.getAttribute('data-tid');
    const suffix = tabTid?.match(/;tb(-\d+)?$/)?.[1] ?? '';
    const prefix = tab ? 'MF;TF' + suffix : null;
    const exact = name => [...document.querySelectorAll('[data-tid='+JSON.stringify(name)+']')];
    const graph = prefix && exact(prefix+';ModelForm;cmpDiagram');
    const workarea = prefix && exact(prefix+';ModelForm;pnlWorkarea');
    const home = prefix && exact(prefix+';HomePage;btnCreateUnsavedPackage');
    const crumbs = prefix ? [...document.querySelectorAll('[data-tid^='+JSON.stringify(prefix+';cnrNaviMode;b.s_')+']')]
      .map(e=>({tid:e.getAttribute('data-tid'),label:(e.textContent??'').trim()})) : [];
    const blockers = [...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-message-box,.bg-mask-message,.x-mask-msg,.x-form-invalid-under')].filter(visible);
    const blockingWindows=blockers.length?{
      viewport:{width:innerWidth,height:innerHeight,scroll_x:globalThis.scrollX??null,scroll_y:globalThis.scrollY??null},
      windows:blockers.slice(0,12).map(e=>{
        const c=globalThis.Ext?.getCmp?.(e.id),style=getComputedStyle(e),box=e.getBoundingClientRect();
        const short=v=>typeof v==='string'?v.slice(0,512):null;
        // Read only the exact native MessageBox's rendered text, never form
        // values or arbitrary window text. These diagnostics grant no gesture.
        const messageBox=c?.$className==='Ext.window.MessageBox'&&c.el?.dom===e;
        const read=(element,limit)=>{
          if(!element||!e.contains(element)||!visible(element))return {text:null,truncated:false};
          const parts=[],walker=document.createTreeWalker(element,4);
          let node,count=0,length=0;
          while(count++<512&&(node=walker.nextNode())&&length<8192){
            let safe=true;
            for(let parent=node.parentElement,depth=0;parent&&depth<64;parent=parent.parentElement,depth++){
              if(parent.matches('input,textarea,select,script,style,[contenteditable="true"]')
                ||/password|passwd|secret|token|credential|authorization|api[_ -]?key|парол|секрет|токен/i.test(
                  ['name','id','data-tid','autocomplete','aria-label'].map(k=>parent.getAttribute(k)??'').join(' ')))safe=false;
              if(parent===e)break;
            }
            if(safe&&visible(node.parentElement)){
              const value=(node.textContent??'').slice(0,8192-length);parts.push(value);length+=value.length;
            }
          }
          const raw=parts.join(' ').replace(/\s+/g,' ').trim();
          // Conservatively omit the field when it contains credential syntax;
          // the caller's session redactor also removes configured secret values.
          const text=/(?:password|passwd|api[_ -]?key|token|secret|пароль|токен|секретный ключ)["']?\s*[:=]|\b(?:Bearer|Basic)\s+\S+|\b(?:sk-|gh[pousr]_|glpat-)[\w-]{12,}|https?:\/\/[^\s/]*@|[?&#](?:key|auth|token|password|secret|api_key)=/i.test(raw)?'[redacted]':raw;
          return {text:text.slice(0,limit),truncated:raw.length>limit||count>512||length>=8192};
        };
        const title=messageBox?read(c.header?.titleCmp?.textEl?.dom??e.querySelector('.x-title-text'),240):null;
        const text=messageBox?read(c.msg?.el?.dom??e.querySelector('.x-window-text,.x-message-box-text,.bg-error-messages'),2048):null;
        const buttons=messageBox?[...e.querySelectorAll('button,[role="button"],.x-btn')].filter(visible):[];
        return {tid:short(e.getAttribute('data-tid')),class_name:short(e.getAttribute('class')),
          bounding_box:{x:box.x,y:box.y,width:box.width,height:box.height},
          style:Object.fromEntries(['display','visibility','opacity','position','top','left','transform'].map(k=>[k,short(style[k])])),
          native_owner:{class_name:short(c?.$className),exact_dom:c?.el?.dom===e,hidden:typeof c?.hidden==='boolean'?c.hidden:null,
            prepared_picker:[...state.receipts.values()].some(r=>r.openDialogElement===e&&r.openDialog===c)},
          ...(messageBox?{message_box:{title:title.text,title_truncated:title.truncated,text:text.text,text_truncated:text.truncated,
            buttons:buttons.slice(0,8).map(b=>{const label=read(b,120);return {tid:short(b.getAttribute('data-tid')),label:label.text,label_truncated:label.truncated};}),
            buttons_truncated:buttons.length>8}}:{})};
      })}:null;
    const unsaved = blockers.some(e => /сохранить изменения в пакете/i.test(e.textContent??''));
    const hardBlocked = blockers.some(e=>!e.matches('.bg-mask-message,.x-mask-msg'));
    const openErrors = [...document.querySelectorAll('.bg-error-messages')].filter(visible);
    const app = globalThis.bg?.app;
    if(options.storageBinding && (state.id!==options.storageBinding.document_id
      ||location.origin!==options.storageBinding.origin||app?.Version!==options.storageBinding.loginom_build
      ||app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName!==options.storageBinding.loginom_account))
      return {error:'STORAGE_IDENTITY_CHANGED'};
    const form=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    const files=prefix&&exact(prefix+';FileStorageForm'),sender=form?.FFileSenderManager,input=form?.FFileInput;
    const filesReady=options.intent==='open_package'&&files?.length===1&&visible(files[0])
      &&form?.constructor?.name==='FileStorageForm'&&form.FView?.el?.dom===files[0]
      &&sender?.constructor?.name==='FileSenderManager'&&sender.FActiveLoadersCount===0
      &&sender.FLastConflictResult===undefined&&!Object.keys(sender.FCurrentUploadFilePaths??{}).length
      &&sender.CurrentDirectory===options.packagePath.slice(0,options.packagePath.lastIndexOf('/')+1)
      &&input?.isConnected&&input.files?.length===0;
    let node = app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.Node?.data?.node;
    let packageNode = null;
    const seen = new Set();
    for (let depth=0; node && depth<32 && !seen.has(node); depth++) {
      seen.add(node);
      if (app.PackageTreeNode && node instanceof app.PackageTreeNode) { packageNode=node; break; }
      node=node.ParentNode;
    }
    let path = packageNode?.PackageFileName;
    path = typeof path==='string' && path ? '/'+path.replaceAll('\\','/').replace(/^\/+/, '') : null;
    const ready = !!tab && graph?.length===1 && visible(graph[0]) && workarea?.length===1 && visible(workarea[0])
      && !!packageNode && crumbs.length>2 && crumbs.length<=32 && blockers.length===0;
    if(mode==='identity')return {document_id:state.id,blocked:blockers.length>0,
      loginom_account:app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName??null};
    const request = JSON.stringify({session:options.sessionId,intent:options.intent,packagePath:options.packagePath,workflowRef:options.workflowRef});
    const knownWorkflow = options.intent==='existing_workflow' ? [...state.receipts.values()].find(r=>r.workflowId===options.workflowRef.workflow_id && r.tab) : null;
    const receipt = state.receipts.get(options.operationId);
    if (receipt && receipt.request !== request) return {error:'OPERATION_CONFLICT'};
    if (mode==='reserve' && receipt?.preserved.some(item=>!tabs.includes(item.tab)
        || !item.graph.isConnected || item.graph.innerHTML!==item.html)) return {error:'FOREIGN_WORKFLOW_CHANGED'};
    if (mode==='reserve' && !receipt) {
      const preserved = tabs.map(t => {
        const ending=t.getAttribute('data-tid').match(/;tb(-\d+)?$/)?.[1]??'';
        const diagrams=exact('MF;TF'+ending+';ModelForm;cmpDiagram');
        return diagrams.length===1 ? {tab:t,graph:diagrams[0],html:diagrams[0].innerHTML} : null;
      }).filter(Boolean);
      state.receipts.set(options.operationId,{request,before:tabs,preserved,phase:'reserved',
        packageInventoryBefore:app?.Application?.FInstance?.FMainForm?.FMapTree?.PackageNodes?.Count,
        openConnection:app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection,
        openServerSession:app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.Session,
        openAccount:app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName});
    }
    const current = state.receipts.get(options.operationId);
    if(mode==='open_dialog') {
      const roots=exact('OpenDialogForm'),element=roots.length===1?roots[0]:null;
      const component=element&&globalThis.Ext?.getCmp?.(element.id);
      if(!current || !element?.isConnected || component?.$className!=='bg.filedialog.view.OpenDialogForm'
        || component.el?.dom!==element)return {error:'UI_BLOCKED'};
      current.openDialogElement=element;current.openDialog=component;
      return {bound:true};
    }
    if(mode==='open_submit') {
      const element=current?.openDialogElement,component=element&&globalThis.Ext?.getCmp?.(element.id);
      if(!element?.isConnected||component!==current.openDialog||component.$className!=='bg.filedialog.view.OpenDialogForm'||component.el?.dom!==element
        ||component.hidden!==false||Date.now()>=deadline)return {error:'UI_BLOCKED'};
      current.openSubmitted=true;
      current.openErrorBefore=globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance?.FErrorMessageInfo??null;
      current.openErrorAbsent=openErrors.length===0;
      return {bound:true};
    }
    const map=app?.Application?.FInstance?.FMainForm?.FMapTree, connection=map?.FServerConnection;
    const absenceStillBound = proof => {
      const currentTabs=[...document.querySelectorAll('[data-tid^="MF;cntMain;cntWorkspace;Workspace;t.br;tb"]')]
        .filter(e=>/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(e.getAttribute('data-tid')));
      return proof && state.document===document && globalThis.bg?.app===app
        && app.Application.FInstance.FMainForm.FMapTree===map && map?.PackageNodes?.Count===0
        && map.FServerConnection===proof.connection && connection?.Connected===true && connection.Session===proof.session
        && typeof proof.account==='string' && proof.account.length>0 && connection.UserName===proof.account
        && currentTabs.length===proof.tabs.length && currentTabs.every((t,i)=>t===proof.tabs[i])
        && currentTabs.filter(t=>t.classList.contains('x-tab-active'))[0]===proof.tab
        && [...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-message-box,.bg-mask-message,.x-mask-msg,.x-form-invalid-under')].every(e=>!visible(e))
        && home?.length===1 && exact(prefix+';HomePage;btnCreateUnsavedPackage')[0]===home[0] && visible(home[0]) && Date.now()<deadline;
    };
    if (mode==='check_missing_package') {
      // A read-only server existence check is limited to an empty, authenticated
      // home workspace. Never infer absence from a filtered/virtualized file list.
      const proof={connection,session:connection?.Session,account:connection?.UserName,tab,tabs:[...tabs]};
      if (absenceStillBound(proof) && typeof proof.session?.get_FileStorage==='function') {
        const storage=await proof.session.get_FileStorage();
        if (!absenceStillBound(proof)) return {error:'WORKSPACE_CHANGED'};
        if (typeof storage?.FileExists==='function') {
          const exists=await storage.FileExists(options.packagePath);
          if (!absenceStillBound(proof)) return {error:'WORKSPACE_CHANGED'};
          if (exists===false) {current.missing=proof;current.phase='missing_package';return {missing:true,document_id:state.id,loginom_account:proof.account};}
        }
      }
    }
    if (mode==='effect') current.phase='effect_possible';
    if (mode==='lookup') {
      if (!receipt) return {exists:false,document_id:state.id};
      if (receipt.phase==='missing_package') return absenceStillBound(receipt.missing)
        ? {missing:true,document_id:state.id,loginom_account:receipt.missing.account} : {error:'WORKSPACE_CHANGED'};
      if (receipt.tab) {
        if (!tabs.includes(receipt.tab)) return {error:'WORKFLOW_LOST'};
        return {exists:true,tab_tid:receipt.tab.getAttribute('data-tid'),phase:receipt.phase};
      }
      return {exists:true,phase:receipt.phase};
    }
    if (mode==='verify') {
      if (options.intent==='existing_workflow' && (!knownWorkflow || packageNode!==knownWorkflow.packageNode || tab!==knownWorkflow.tab
          || state.id!==options.workflowRef.document_id || tabTid!==options.workflowRef.tab_tid
          || crumbs.length!==options.workflowRef.navigation_path.length
          || crumbs.some((crumb,i)=>crumb.tid!==options.workflowRef.navigation_path[i].tid || crumb.label!==options.workflowRef.navigation_path[i].label))) return {error:'WORKFLOW_CHANGED'};
      if (options.intent==='open_package' && openErrors.length) {
        // Capture only this Open's newly reported native error. This is not
        // proof of no effect, nor permission to retry Open or dismiss other UI.
        const instance=globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance;
        const message=instance?.FMessageBox,root=message?.el?.dom,messages=instance?.FMessages;
        if(current?.openSubmitted===true&&current.openErrorAbsent===true&&!current.openError
          &&openErrors.length===1&&openErrors[0]===messages?.el?.dom&&root?.contains(openErrors[0])
          &&/^msgbox(?:-\d+)?$/.test(root.getAttribute('data-tid')??'')
          &&globalThis.Ext?.getCmp?.(root.id)===message&&instance.FErrorMessageInfo
          &&instance.FErrorMessageInfo!==current.openErrorBefore
          &&(openErrors[0].textContent??'').trim()==="Cannot read properties of undefined (reading 'TestableCellRenderer')")
          current.openError={instance,message,root,messages,info:instance.FErrorMessageInfo,element:openErrors[0]};
        return {error:'PACKAGE_OPEN_REJECTED',renderer_error:!!current?.openError,blocking_windows:blockingWindows};
      }
      if(blockingWindows?.windows.some(w=>w.message_box))return {error:'NATIVE_MESSAGE_BOX_BLOCKED',blocking_windows:blockingWindows};
      if (!ready) return blockingWindows?{pending:true,blocking_windows:blockingWindows}:null;
      if (current?.tab && (tab!==current.tab || packageNode!==current.packageNode
          || JSON.stringify(crumbs)!==JSON.stringify(current.crumbs))) return {error:'WORKFLOW_CHANGED'};
      if (!current?.tab && options.intent==='new_draft') {
        const added=tabs.filter(t=>!current?.before.includes(t));
        if (added.length!==1 || added[0]!==tab) return null;
      }
      const preserved=(current?.preserved??[]).map(item=>({tab_tid:item.tab.getAttribute('data-tid'),
        graph_unchanged:tabs.includes(item.tab) && item.graph.isConnected && item.graph.innerHTML===item.html}));
      if (preserved.some(item=>!item.graph_unchanged)) return {error:'FOREIGN_WORKFLOW_CHANGED'};
      if (options.intent==='new_draft' && path) return {error:'EXPECTED_UNSAVED_DRAFT'};
      if (options.intent==='open_package' && path!==options.packagePath) return null;
      if (!current) return {error:'RECEIPT_MISSING'};
      current.tab=tab;current.packageNode=packageNode;current.crumbs=crumbs;current.phase='verified';
      current.workflowId ??= knownWorkflow?.workflowId ?? state.id+'-'+(state.sequence=(state.sequence??0)+1);
      return {document_id:state.id,loginom_account:app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName ?? null,
        workflow_ref:{tab_tid:tabTid,prefix,navigation_path:crumbs,workflow_id:current.workflowId},
        package_ref:{path,name:packageNode.PackageName??null,persisted:path!==null},preserved_workflows:preserved,
        ownership_verified:options.intent==='new_draft',target_verified:true,
        interaction_readiness:'driver_verification_required',
        window:{width:innerWidth,height:innerHeight,outer_width:outerWidth,outer_height:outerHeight,
          available_width:screen.availWidth,available_height:screen.availHeight}};
    }
    return {document_id:state.id,requested_tab_present:!!knownWorkflow && tabs.includes(knownWorkflow.tab) && knownWorkflow.tab.getAttribute('data-tid')===options.workflowRef?.tab_tid,blocked:blockers.length>0,hard_blocked:hardBlocked,unsaved,ready,files_ready:filesReady,home_ready:home?.length===1 && visible(home[0]),package_path:path,tab_tid:tabTid,
      ...(blockingWindows?{blocking_windows:blockingWindows}:{})};
  }, {mode, options, deadline});
  try {
    const current = page.url() === 'about:blank' ? null : await page.evaluate(() => ({origin:location.origin,pathname:location.pathname}));
    if (page.url() !== 'about:blank' && (current.origin !== options.origin || current.pathname !== options.pathname)) {
      return result('NOT_READY','FOREIGN_PAGE');
    }
    if (page.url()==='about:blank') {
      if (options.recoverOnly) return result('NOT_READY','DOCUMENT_LOST');
      await page.goto(options.url,{waitUntil:'domcontentloaded',timeout:remaining()});
    }
    const build=await wait('ui_build',()=>page.evaluate(()=>globalThis.bg?.app?.Version??null));
    target={profile_id:options.profileId,loginom_build:build,platform:options.platform,browser:'chromium'};
    if (build!==options.expectedBuild) return result('INCOMPATIBLE','UI_BUILD_MISMATCH');
    const avatar=tid('MF;cntMain;tlbMainToolbar;btnAvatar'), login=tid('LoginForm;Login;edtUsername');
    await wait('login_or_workspace',async()=>await avatar.isVisible() || await login.isVisible());
    if (!(await avatar.isVisible())) {
      if (!options.allowTestLogin || options.identityOnly) return result('LOGIN_REQUIRED','AUTHENTICATION_REQUIRED');
      await login.locator('input').fill(options.testLoginUser,{timeout:remaining()});
      await tid('LoginForm;Login;edtPassword').locator('input').fill('',{timeout:remaining()});
      await tid('LoginForm;Login;btnLogin').click({timeout:remaining()});
      const authenticated=await wait('login_result',async()=>await avatar.isVisible() ? 'authenticated'
        : await page.locator('.x-form-invalid-under:visible').count() ? 'rejected' : null);
      if (authenticated==='rejected') return result('LOGIN_REQUIRED','LOGIN_REJECTED');
    }
    authenticated=true;
    if(options.identityOnly){
      const binding=await inspect('identity');
      if(binding.blocked||typeof binding.loginom_account!=='string'||!binding.loginom_account.trim())
        return result('NOT_READY','STORAGE_IDENTITY_UNAVAILABLE');
      return result('BOUND',null,{document_id:binding.document_id,loginom_account:binding.loginom_account,target_verified:true});
    }
    const old=await inspect('lookup');
    if (old.error) return result('NOT_READY',old.error,{authenticated:true});
    if (old.missing) return missingPackage(old);
    // A confirmed pre-open refusal may continue without replacing its original receipt.
    if (old.phase==='reserved' && (options.intent!=='open_package' || options.recoverOnly))
      return result('NOT_READY','PREVIOUS_ATTEMPT_NOT_COMPLETED',{authenticated:true});
    if (old.exists && old.phase!=='reserved') {
      if (old.tab_tid) await tid(old.tab_tid).click({timeout:remaining()});
      effectPossible=true;
    } else {
      if (options.recoverOnly) return result('NOT_READY','RECEIPT_LOST',{authenticated:true});
      const before=await wait('workspace_entry_ready',async()=>{const state=await inspect('observe');return state.error || state.hard_blocked || (!state.blocked && (state.ready || state.home_ready || state.files_ready
        || options.intent==='existing_workflow'&&state.requested_tab_present)) ? state : null;});
      if(before.error)return result('NOT_READY',before.error,{authenticated:true});
      if (before.blocked) return result('NOT_READY',before.unsaved?'UNSAVED_CHANGES':'UI_BLOCKED',{authenticated:true});
      if(options.intent==='existing_workflow' && (before.document_id!==options.workflowRef.document_id || !before.requested_tab_present)) return result('NOT_READY','WORKFLOW_LOST',{authenticated:true});
      const reserved=await inspect('reserve');
      if (reserved.error) return result('NOT_READY',reserved.error,{authenticated:true});
      if (options.intent==='open_package' && before.home_ready) {
        const checked=await inspect('check_missing_package');
        remaining();
        if (checked.error) return result('NOT_READY',checked.error);
        if (checked.missing) return missingPackage(checked);
      }
      if (options.intent==='existing_workflow') {
        const effect=await inspect('effect');if(effect.error)return result('NOT_READY',effect.error,{authenticated:true});effectPossible=true;
        await tid(options.workflowRef.tab_tid).click({timeout:remaining()});
      } else if (!(options.intent==='open_package' && before.ready && before.package_path===options.packagePath)) {
      // Home-page and menu are the two pinned E2E entry points. Do not reuse the active workflow.
      await tid('MF;cntMain;tlbMainToolbar;btnPackagesMenu').click({timeout:remaining()});
      const button=tid('MF;MainMenuForm;'+(options.intent==='new_draft'?'btnCreateUnsavedPackage':'btnOpenPackage'));
      await wait('package_menu_ready',()=>button.isVisible());
      const effect=await inspect('effect');if(effect.error)return result('NOT_READY',effect.error,{authenticated:true});effectPossible=true;
      await button.click({timeout:remaining()});
      if (options.intent==='new_draft') createdDraft=true;
      else {
        const field=tid('OpenDialogForm;edtFileName').locator('input');
        await wait('open_package_dialog',()=>field.isVisible());
        const picker=await inspect('open_dialog');
        if(picker.error)return result('NOT_READY',picker.error);
        await field.fill(options.packagePath,{timeout:remaining()});
        const submitted=await inspect('open_submit');
        if(submitted.error)return result('NOT_READY',submitted.error);
        await tid('OpenDialogForm;btnOpen').click({timeout:remaining()});
      }
      }
    }
    const verified=await wait('exact_workflow_ready',()=>inspect('verify'));
    if (verified.error) return result('NOT_READY',verified.error,{authenticated:true,
      ...(verified.error==='NATIVE_MESSAGE_BOX_BLOCKED'?{message:'Loginom is blocked by a native MessageBox. Report its title, text and buttons from trace.blocking_windows to the user. Preparation is unconfirmed; do not repeat the package gesture or dismiss an unknown dialog.'}:{}),
      ...(verified.error==='PACKAGE_OPEN_REJECTED' ? {message:(verified.renderer_error
        ? 'Loginom could not render the opened package (TestableCellRenderer). '
        : 'Loginom reported an error while opening the saved package. ')
        +'The package may already be open; do not repeat Open. Reconcile the SAME operation_id and close the owned package/session before trying a new preparation.'} : {})});
    createdDraft=options.intent==='new_draft';
    return result('READY',null,{authenticated:true,...verified,replayed:old.exists===true});
  } catch (error) {
    return result('NOT_READY',error.message==='DEADLINE'?'DEADLINE':'PREPARATION_INTERRUPTED',
      {created_draft:createdDraft,verification_required:effectPossible});
  }
}

export function makeWorkspacePrepareCode({ loginomUrl, compatibility, allowTestLogin = false, testLoginUser = null, platform = process.platform, sessionId = "standalone", operationId = "prepare", intent = "new_draft", packagePath = null, workflowRef = null, timeoutMs = 120000, recoverOnly = false, identityOnly = false, storageBinding = null }) {
  const url = new URL(loginomUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some(key => /token|password|secret|auth|api.?key/i.test(key))) {
    throw new Error('Workspace preparation requires a credential-free Loginom URL');
  }
  if (allowTestLogin && (typeof testLoginUser !== 'string' || !testLoginUser.trim() || testLoginUser.length>200 || /[\x00-\x1f\x7f]/.test(testLoginUser))) throw new Error('Test login requires an explicit Loginom account');
  if (!['new_draft', 'open_package', 'existing_workflow'].includes(intent)) throw new Error('Unknown preparation intent');
  for (const value of [sessionId, operationId]) if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new Error('Invalid preparation identity');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid preparation deadline');
  if (intent === 'open_package' && (typeof packagePath !== 'string' || !/^\/[^\\\x00-\x1f]+\.lgp$/i.test(packagePath)
      || packagePath.split('/').some(part => part === '..' || part === '.') || packagePath.includes('//'))) throw new Error('An exact absolute package path is required');
  if (intent !== 'open_package' && packagePath !== null) throw new Error('A new draft cannot specify a stored package');
  if (intent === 'existing_workflow') {
    if (!workflowRef || Object.keys(workflowRef).some(k=>!['document_id','tab_tid','prefix','navigation_path','workflow_id'].includes(k))
        || typeof workflowRef.workflow_id !== 'string' || !workflowRef.workflow_id || workflowRef.workflow_id.length>160
        || typeof workflowRef.document_id !== 'string' || !workflowRef.document_id || workflowRef.document_id.length>128
        || !/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(workflowRef.tab_tid??'')
        || workflowRef.prefix !== 'MF;TF'+(workflowRef.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'')
        || !Array.isArray(workflowRef.navigation_path) || !workflowRef.navigation_path.length || workflowRef.navigation_path.length>32
        || workflowRef.navigation_path.some(p=>!p || typeof p.tid!=='string' || p.tid.length>2048 || typeof p.label!=='string' || p.label.length>240)) throw new Error('An exact document-bound workflow reference is required');
  } else if (workflowRef !== null) throw new Error('Workflow reference requires existing_workflow intent');
  if (!compatibility?.loginom_build) throw new Error('An exact Loginom build pin is required');
  const options = { url: url.href, origin: url.origin, pathname: url.pathname,
    sessionId, operationId, intent, packagePath, workflowRef, timeoutMs, recoverOnly, identityOnly, storageBinding,
    expectedBuild: compatibility?.loginom_build ?? null, profileId: compatibility?.profile_id,
    platform: ({ darwin: 'macos', linux: 'linux', win32: 'windows' })[platform] ?? platform,
    allowTestLogin: allowTestLogin === true, testLoginUser: allowTestLogin ? testLoginUser : null };
  if (compatibility?.platform !== options.platform || compatibility?.browser !== 'chromium') {
    throw new Error('The pinned Loginom compatibility profile does not support this platform/browser');
  }
  return `async (page) => (${prepareWorkspace.toString()})(page, ${JSON.stringify(options)})`;
}

export function parseWorkspacePreparation(response) {
  if (response?.isError) throw new Error('Loginom workspace preparation failed');
  for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    const match = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);
    let value;
    try { value = JSON.parse(match?.[1] ?? block.text); } catch { continue; }
    if (!['READY', 'BOUND', 'LOGIN_REQUIRED', 'INCOMPATIBLE', 'NOT_READY'].includes(value?.status)
        || (value.target !== null && typeof value.target?.loginom_build !== 'string')
        || typeof value.authenticated !== 'boolean' || typeof value.created_draft !== 'boolean') continue;
    if (value.status === 'READY' && (!value.authenticated || !value.target?.loginom_build || !value.document_id
        || value.target_verified !== true || !value.workflow_ref?.tab_tid || !value.workflow_ref?.prefix || !value.workflow_ref?.workflow_id
        || !Array.isArray(value.workflow_ref?.navigation_path) || !value.package_ref)) continue;
    if(value.status==='BOUND'&&(!value.authenticated||!value.document_id||!value.loginom_account||value.target_verified!==true))continue;
    return value;
  }
  throw new Error('Workspace preparation returned no verified state; repeat the same preparation operation to reconcile its receipt');
}

export function requirePreparedWorkspace(metadata) {
  if (!metadata.skillRevision || metadata.workspaceReady !== true || !metadata.targetIdentity?.loginom_build) {
    throw new Error('NOT_READY: call dock_prepare and complete Loginom workspace preparation first');
  }
}

// Called inside the same browser gate as actions. Readiness is not published to
// another action until evidence and the session manifest have both been saved.
export async function prepareWorkspaceSession({ metadata, assertAllowed, prepare, assertTarget, record, save, request = null, signal }) {
  assertAllowed();
  if (metadata.workspaceReady === true && !request) {
    throw new Error('Workspace is already prepared. Use dock_workspace_observe for the current UI and dock_action_describe to reread input_artifacts. Preparation has not changed the workspace.');
  }
  const identity = request ? JSON.stringify(request) : null;
  let previous = metadata.workspacePreparation;
  if (previous && previous.identity !== identity) {
    // A verified no-effect refusal permits a new explicit package; a proven
    // missing package also permits a new draft. Uncertain attempts keep their ID.
    const missingWithoutEffect = previous.state?.reason === 'PACKAGE_OPEN_REJECTED'
      && previous.state.package_absence_verified === true
      && JSON.parse(previous.identity).intent === 'open_package'
      && previous.state.package_path === JSON.parse(previous.identity).package_path;
    const replaceRefusal = previous.effect_possible === false
      && previous.state?.status === 'NOT_READY' && (previous.state.reason === 'WORKFLOW_LOST' || missingWithoutEffect || request?.intent === 'open_package')
      && previous.state.effect_possible === false && previous.state.created_draft === false
      && previous.state.authenticated === true;
    if (previous.operation_id === request?.operation_id
        || !replaceRefusal && (metadata.workspaceReady !== true || previous.state?.status !== 'READY')) {
      throw new Error('Preparation operation conflict: reconcile the existing request first');
    }
    previous = null;
  }
  metadata.workspaceReady = false;
  try {
    if (request) {
      metadata.workspacePreparation = { identity, operation_id: request.operation_id, attempted: true,
        effect_possible: true };
      await save();
    }
    const state = await prepare({ recoverOnly: previous?.effect_possible === true });
    if (request) metadata.workspacePreparation = { ...metadata.workspacePreparation, effect_possible: state.effect_possible, state };
    if (signal?.aborted) {
      state.status = 'NOT_READY'; state.reason = 'CANCELLED';
      state.verification_required = state.effect_possible;
    }
    if (state.status === 'READY') {
      assertTarget(state.target);
      metadata.targetIdentity = state.target;
      metadata.workflowRef = state.workflow_ref;
    } else {
      metadata.targetIdentity = null;
      metadata.workflowRef = null;
    }
    await record({ event: 'workspace_prepared', state });
    metadata.workspaceReady = state.status === 'READY';
    await save();
    return state;
  } catch (error) {
    metadata.workspaceReady = false;
    metadata.targetIdentity = null;
    metadata.workflowRef = null;
    throw error;
  }
}

export const workspaceObserveTool = {
  name: 'dock_workspace_observe',
  description: 'Read a compact page of the prepared Loginom workspace. Before preparation, scope bootstrap reads only application/build/login/blocker state without navigation, login, draft creation or capture activation. For an active wizard, prefer scope wizard: it discovers and reads the unique current wizard in one request, preserving global blockers and context. If no unique wizard is observed it returns roots with an explicit selection trace, without guessing. Modal dialogs and dropdown portals still require their own observed root. Otherwise choose all (default), palette, graph or dialogs. wizard.grouping.available_fields lists bounded selectable input fields even before any keys or measures are chosen; only delivered ui.elements with grouping_field.role=available authorize selection. The observed move buttons assign the selected field to Group or Measures. Empty summary rows may reuse a field tid and are never actionable. This metadata does not prove complete source schema or applied settings. wizard metadata reports the visible title, recognized current stage and lifecycle button states; input_mapping may be a normal step before a node-specific page. In verified Loginom 7.4.2, the Calculator node wizard goes from calculator directly to done; its input and output mappings are separate port configuration wizards opened from the observed graph port context menu. Do not infer that Next opens input_mapping or output_mapping. Verify the actual visible stage; node expressions and port mappings require separate finish/reopen readback. wizard.import_source reports observed text import source_path, connection, encoding, rows_to_skip and first_line_as_title; it does not prove source bytes or applied settings. wizard.import_column_editor binds an open type/data_kind editor to its selected column. To open its choices, click the delivered picker_ref once; input_ref is the value field and clicking it does not open the list. Observe the resulting boundlist, using scope roots if it floats outside the wizard. select_wizard_option may be offered for delivered options and verifies the closed editor plus settled type and data_kind. Changing type can also change data_kind. wizard.settings exposes bounded draft values for observed text import format fields, preserving whitespace and the literal null marker; missing or ambiguous fields remain unobserved/ambiguous. wizard.import_columns reports up to eight rendered import column definitions with name, label, type, data_kind, used and cell_refs, bound by native column index; missing or ambiguous cells remain unobserved_or_ambiguous. definition_coverage can report complete_configured_columns only when all bounded native headers/cells fit visibly between unique first/last headers with contiguous indexes and no open editor or horizontal overflow. It covers the configured fields in that wizard, not source-file schema or execution results; otherwise it reports partial. complete and settings_applied remain false. For a newly configured import, the observed Определить типы данных control recalculates types and data kinds; use it after format setup and before manual type corrections, then obtain fresh settled column and result-preview observations. It replaces existing type/kind choices, so preserve deliberate existing choices when editing an established import. The preview can retain old conversions before that recalculation. Check the resulting definitions before configuring downstream expressions. These metadata refs do not grant undelivered actions. Writable field records may offer set_wizard_field with exact draft readback. It does not prove node ownership, applied settings or execution. Graph controls may include graph_node with node_label and part body/label/settings, bound to the current visible node. graph_identity binds their observed native_prefix to the unique diagram container of the active workflow; the native prefix can differ after Loginom reuses a tab. Read the whole observed cmpDiagram region to establish this binding. Roots discovery and a smaller descendant read leave graph_identity unobserved and do not issue graph actions. Prefer the body for node selection: a label click alone does not prove selection. If settings is not observed, click the delivered body ref once, observe again, then use open_wizard on the delivered settings ref when offered. It confirms the original tab, workflow breadcrumb path and node label after one click, recorded as wizard_open_verified; a confirmation dialog or wrong node remains unconfirmed. Otherwise inspect the missing navigation context before using the E2E settings click. wizard.owner_context alone has opening_verified=false and does not replace that action receipt. On the done page, completion reports the displayed label and label mode; finish_wizard is offered only when these are ready. It clicks Done once and confirms the expected graph node and workflow. wizard_finish_graph_verified requires reopening and settings readback; it does not prove package save. Anonymous Graph;Vertex records are SVG geometry, not named node selectors. These metadata do not grant undelivered refs or prove selection; double-click is not the settings contract. Optionally supply root_ref plus its observation_id to limit detailed UI elements/cells to an already delivered element and its descendants. Detailed traversal is limited to the root; global context and blockers use fixed native queries. Graph completeness is not established by a root read. Use scope roots to discover regions in an oversized document without detailed traversal. If a new broad read exceeds the scan budget, the response instead delivers roots (page.scope and observation_kind are roots, with observation_scope_fallback in the trace). This is region discovery, not a graph or dialog completeness claim: read a delivered region with root_ref and observation_id before acting. Cursor and explicit-root reads never silently change their scope. With scope roots, optional storage_name finds rendered file-storage name candidates using a fixed native query, without walking the table. Missing candidates do not prove file absence; formatted IDs may collide, so read and verify the actual candidate before acting. Region refs have no gestures: first read one using root_ref and observation_id, then act on its delivered controls. Discovery is not proof that blockers are absent. Continue with cursor=page.next_cursor alone; pages share observation_id and revision. If the workspace changes, start a new observation. Only delivered UI refs can be used. visible means rendered, not necessarily reachable: prefer interaction.state=point_observed for gestures. outside_viewport and point_not_observed indicate that no interaction point was seen; read other pages to find a reachable target, especially after scroll. Truncation and full_dom_complete=false mean this is not proof of the whole workspace. Recognized Preview/Table cells expose data_cell view/field/row identity, bounded untrimmed display_text and observed null_marker_present; data_column records expose declared UI types. Missing/ambiguous headers suppress cell text. These describe rendered data only: they do not establish execution identity, full row coverage or numeric precision. Calculator editor records distinguish bounded rendered_lines from document.text: full_text_verified=true requires a complete read of the bound CodeMirror document; rendered_lines alone never establish it. selected_expression identifies the selected field. Only a writable expression-mode document offers replace_expression; generic editor gestures remain unavailable. Neither document text nor syntax_validity=unverified proves syntax validity or saved settings. interaction.covering identifies up to three layers found over a point_not_observed target, using only tag/test identity/role (sensitive layers are redacted). These are diagnostic identities, not actionable refs: inspect the current UI or discover regions to resolve the covering layer before retrying. Read-only.',
  inputSchema: { type: 'object', properties: {
    scope: { type: 'string', enum: ['bootstrap', 'all', 'palette', 'graph', 'dialogs', 'roots', 'wizard'] },
    cursor: { type: 'string', minLength: 1, maxLength: 128 },
    storage_name: {type:'string',minLength:1,maxLength:200},
    root_ref: {type:'string',minLength:1,maxLength:128},
    observation_id: {type:'string',minLength:1,maxLength:128},
  }, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
};

function bootstrapWorkspace(page, expected) {
  return (async () => {
    if (page.isClosed?.()) throw new Error('Bootstrap page is closed');
    const url = page.url();
    if (typeof url !== 'string' || !url) throw new Error('Bootstrap page URL is unavailable');
    // URL belongs to the browser realm, not the unsafe VM executing this helper.
    const origin = url === 'about:blank' ? null : await page.evaluate(url => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null;
      } catch { return null; }
    }, url);
    let output = { bootstrap: true, target_state: url === 'about:blank' ? 'not_open' : 'indeterminate', origin, authenticated: null,
      login_required: null, compatible_build: null, observation_only: true };
    if (origin === expected.origin) {
      output = await page.evaluate(({ expectedBuild, expectedOrigin }) => {
        if (location.origin !== expectedOrigin) return { bootstrap: true, target_state: 'indeterminate',
          origin: location.origin, authenticated: null, login_required: null, compatible_build: null, observation_only: true };
        const started = Date.now(), walker = document.createTreeWalker(document.documentElement, 1);
        let visited = 0, element, exhausted = false, avatar = false, login = false, dialogs = 0, masks = 0;
        const visible = element => {
          const box = element.getBoundingClientRect();
          if (!(box.width > 0 && box.height > 0)) return false;
          let depth = 0;
          for (let parent = element; parent; parent = parent.parentElement) {
            if (++depth > 64 || Date.now() - started > 75) return false;
            const style = getComputedStyle(parent);
            if (parent.hasAttribute('hidden') || style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.opacity === '0') return false;
          }
          return true;
        };
        while (visited < 4000 && Date.now() - started <= 75) {
          element = walker.nextNode();
          if (!element) { exhausted = true; break; }
          visited++;
          const tid = element.getAttribute('data-tid');
          const isAvatar = tid === 'MF;cntMain;tlbMainToolbar;btnAvatar';
          const isLogin = tid === 'LoginForm;Login;edtUsername';
          const isDialog = element.matches('[role="dialog"],.x-window,.bg-dialog');
          const isMask = element.matches('.bg-mask-message,.x-mask-msg');
          if (!(isAvatar || isLogin || isDialog || isMask) || !visible(element)) continue;
          avatar ||= isAvatar; login ||= isLogin; dialogs += Number(isDialog); masks += Number(isMask);
        }
        const build = globalThis.bg?.app?.Version ?? null, compatible = build === expectedBuild;
        return { bootstrap: true, origin: location.origin, loginom_build: typeof build === 'string' ? build.slice(0,128) : null,
          target_state: !compatible ? 'incompatible_or_loading' : !exhausted ? 'indeterminate'
            : login && !avatar ? 'login_required' : dialogs || masks ? 'blocked' : avatar ? 'ready_for_prepare' : 'indeterminate',
          authenticated: avatar && !login ? true : login && !avatar ? false : null,
          login_required: login && !avatar ? true : avatar && !login ? false : null,
          compatible_build: compatible, blockers: { visible_dialogs: dialogs, visible_masks: masks },
          scan: { visited_elements: visited, complete: exhausted, max_elements: 4000, max_ms: 75 },
          observation_only: true };
      }, { expectedBuild: expected.build, expectedOrigin: expected.origin });
    }
    return { status: 'SUCCEEDED', action_key: 'workspace.observe', action_revision: '1', operation_id: null,
      phase: 'observed', effect_possible: false, cleanup_complete: true, error: null, trace: [], output };
  })();
}

export function makeWorkspaceBootstrapCode({ origin, build }) {
  if (typeof origin !== 'string' || new URL(origin).origin !== origin || typeof build !== 'string' || !build) throw new Error('Bootstrap requires a pinned origin and build');
  return `async (page) => (${bootstrapWorkspace.toString()})(page, ${JSON.stringify({ origin, build })})`;
}

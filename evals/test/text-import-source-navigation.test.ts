import { expect, test } from "bun:test"
import { navigateStorageWithFreshObservation } from "../script/text-import-cold/source-navigation.mjs"

function fixture() {
  const element={ref:"issued-old",tid:"MF;TF-2;FileStorageForm;colName_user",label:"user",
    allowed_actions:["double_click"],storage_entry:{kind:"folder"},interaction:{state:"point_observed"}}
  const snapshot={observation_id:"observation-old",authenticated:true,origin:"http://localhost/",loginom_build:"7.4.2",
    dom_epoch:{document:"owned-document",revision:10728},workflow_ref:{tab_tid:"tab-2",prefix:"MF;TF-2"},
    active_tab_ref:"active-storage",package_identity:null,geometry:{viewport:{width:1920,height:1080}},
    file_storage:{status:"observed",directory:"/"},ui:{elements:[element],dialogs:[],masks:[]}}
  // Ben's authentic failure was a zero-effect precondition refusal at epoch10791.
  const refused={status:"NOT_APPLIED",phase:"preconditions",effect_possible:false,cleanup_complete:true,
    operation_id:"cold-source-nav-2",error:{code:"UI_EPOCH_CHANGED",message:"The document changed while checking the target; observe again"},
    trace:[{event:"ui_observation_started"},{event:"ui_action_failed",code:"UI_EPOCH_CHANGED"}]}
  const succeeded={status:"SUCCEEDED",cleanup_complete:true,effect_possible:true,
    trace:[{event:"ui_preconditions_verified"},{event:"ui_gesture_applied"}]}
  const fresh=structuredClone(snapshot)
  fresh.observation_id="issued-fresh";fresh.dom_epoch.revision=10791;fresh.ui.elements[0]!.ref="fresh-control"
  return {snapshot,element,fresh,refused,succeeded}
}

test("storage epoch compatibility reobserves issued controls and applies only one gesture",async()=>{
  const f=fixture(), actions:string[]=[], records:Record<string,unknown>[]=[]
  let observations=0,gestures=0
  const result=await navigateStorageWithFreshObservation({snapshot:f.snapshot,element:f.element,verb:"double_click",
    observe:async()=>{observations++;return {...structuredClone(f.fresh),observation_id:`issued-fresh-${observations}`}},
    act:async(s,e)=>{
      actions.push(`${s.observation_id}:${e.ref}`)
      if(actions.length===1)return f.refused
      gestures++;return f.succeeded
    },record:async(event:Record<string,unknown>)=>{records.push(event);return event}})
  expect(result).toEqual(f.succeeded)
  expect(observations).toBe(2)
  expect(actions).toEqual(["issued-fresh-1:fresh-control","issued-fresh-2:fresh-control"])
  expect(gestures).toBe(1)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({phase:"cold_storage_navigation_refresh_authorized",rejected_operation_id:"cold-source-nav-2",effect_possible:false})
})

test("storage refresh refuses foreign, changed, ambiguous and nonissued capabilities before gestures",async()=>{
  const f=fixture()
  for(const change of [
    (s:typeof f.fresh)=>{s.authenticated=false},
    (s:typeof f.fresh)=>{s.origin="https://foreign/"},
    (s:typeof f.fresh)=>{s.loginom_build="other"},
    (s:typeof f.fresh)=>{s.dom_epoch.document="foreign"},
    (s:typeof f.fresh)=>{s.workflow_ref.prefix="foreign"},
    (s:typeof f.fresh)=>{s.active_tab_ref="foreign"},
    (s:typeof f.fresh)=>{s.file_storage.directory="/foreign"},
    (s:typeof f.fresh)=>{s.geometry.viewport.width=1},
    (s:typeof f.fresh)=>{s.ui.elements[0]!.label="foreign"},
    (s:typeof f.fresh)=>{s.ui.elements[0]!.storage_entry.kind="file"},
    (s:typeof f.fresh)=>{s.ui.elements[0]!.allowed_actions=[]},
    (s:typeof f.fresh)=>{s.ui.elements[0]!.ref=""},
    (s:typeof f.fresh)=>{s.ui.elements.push(structuredClone(s.ui.elements[0]!))},
  ]){
    const fresh=structuredClone(f.fresh);change(fresh);let actions=0
    await expect(navigateStorageWithFreshObservation({snapshot:f.snapshot,element:f.element,verb:"double_click",
      observe:async()=>fresh,act:async()=>{actions++;return f.succeeded},record:async(e:unknown)=>e})).rejects.toThrow()
    expect(actions).toBe(0)
  }
})

test("storage compatibility never repeats a possible gesture or uncertain outcome",async()=>{
  const f=fixture()
  for(const patch of [{status:"AMBIGUOUS"},{effect_possible:true},{cleanup_complete:false},{phase:"acting"},
    {error:{code:"UI_REFERENCE_STALE"}},{trace:[{event:"ui_preconditions_verified"}]},{trace:[{event:"ui_gesture_applied"}]}]){
    let actions=0
    const refused={...f.refused,...patch}
    const result=await navigateStorageWithFreshObservation({snapshot:f.snapshot,element:f.element,verb:"double_click",
      observe:async()=>f.fresh,act:async()=>{actions++;return refused},record:async(e:unknown)=>e})
    expect(result).toEqual(refused);expect(actions).toBe(1)
  }
})

test("storage precondition observation refresh is bounded and durable authorization is required",async()=>{
  const f=fixture();let actions=0
  let observations=0
  const result=await navigateStorageWithFreshObservation({snapshot:f.snapshot,element:f.element,verb:"double_click",
    observe:async()=>({...f.fresh,observation_id:`issued-${++observations}`}),act:async()=>{actions++;return f.refused},record:async(e:unknown)=>e})
  expect(actions).toBe(3);expect(result).toEqual(f.refused)
  actions=0
  await expect(navigateStorageWithFreshObservation({snapshot:f.snapshot,element:f.element,verb:"double_click",
    observe:async()=>f.fresh,act:async()=>{actions++;return f.refused},record:async()=>null})).rejects.toThrow()
  expect(actions).toBe(1)
})

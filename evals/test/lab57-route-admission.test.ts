import {test,expect} from "bun:test"
import {validateFreshRouteState} from "../src/lab57-route-admission"

const state=()=>({passes:[{originalPids:[],foreignNative:[],denied:[],profileFds:[]},{originalPids:[],foreignNative:[],denied:[],profileFds:[]}],
  profiles:6,foreignMarkers:[],pendingWorkers:[],container:{id:"b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e",startedAt:"2026-10-07T09:05:53.309342637Z",running:true,mounts:[]},
  storage:[{path:"/workdir/UserStorage/user/cc6187e46829a5fa768f09eeb024367d745628a1d10f46f26a0ec5543f76c997-0-semicolon_cp1251_decimal.txt",identity:"58:1179775:150:81a4",sha256:"94821af546f6454601f5338d6fe32b8bf7a85bf7208b34df2bc522e55e2ab4dd"}],
  queuesChecked:8,checkedAt:Date.now()})
test("closed admission requires complete fresh queues/processes/profiles/container/storage",()=>{
  expect(validateFreshRouteState(state(),false)).toBeUndefined()
  const s=state();s.queuesChecked=7
  expect(()=>validateFreshRouteState(s,false)).toThrow("FRESH_GUARD")
})

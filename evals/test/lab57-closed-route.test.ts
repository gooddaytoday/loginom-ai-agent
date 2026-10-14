import {test,expect} from "bun:test"
import {closedRouteArguments,verifyClosedSettlement} from "../src/lab57-closed-route"
test("closed executable rejects ambiguous commands before reading any private input",()=>{
  for(const args of [[],["apply"],["execute","/missing","--unsafe"],["worker","/missing","--retry"],["recover","/missing"]])
    expect(()=>closedRouteArguments(args)).toThrow("CLOSED_ROUTE_ARGUMENTS")
  expect(closedRouteArguments(["plan"])).toEqual({command:"plan",file:null})
})

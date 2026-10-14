import {closedRouteArguments,closedRoutePlan,executeClosedRoute,runClosedNativeWorker} from "../src/lab57-closed-route"
import {routePrivateJson,assertRouteEffect,writeRouteRecord,routeStand} from "../src/lab57-route-host"
import type {RouteContext} from "../src/lab57-route-host"

try {
  const args=closedRouteArguments(process.argv.slice(2))
  if(args.command==="plan")console.log(JSON.stringify({status:"SOURCE_ONLY_NOT_APPLIED",steps:closedRoutePlan,nativeReady:false,cleanup:"UNCONFIRMED",sourceStageRecoveryEffects:0}))
  if(args.command==="execute")console.log(JSON.stringify(await executeClosedRoute(args.file!)))
  if(["worker","admit-helper"].includes(args.command)){
    if(!args.file!.startsWith(routeStand+"/lab57-context-")||!args.file!.endsWith(".json"))throw Error("CLOSED_CONTEXT_PATH_REQUIRED")
    const ctx=await routePrivateJson<RouteContext>(args.file!)
    if(args.command==="worker")console.log(JSON.stringify(await runClosedNativeWorker(ctx)))
    if(args.command==="admit-helper"){
      const identity=await assertRouteEffect(ctx,"official-helper-effect",ctx.once?routeStand+"/lab57-closed":undefined)
      console.log(JSON.stringify({status:"ORIGINAL_OPERATION_ADMITTED",identity,controller:ctx.controller,sourceSha:ctx.admission.sourceSha}))
    }
  }
}catch(error){
  // Lower errors stay in the private producer diagnostics; the public channel contains only a fixed refusal.
  console.error(JSON.stringify({status:"BLOCKED",reason:"CLOSED_ROUTE_REFUSED",originalOutcome:"ERROR",cleanup:"UNCONFIRMED"}))
  process.exitCode=2
}

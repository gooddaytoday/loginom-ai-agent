import {readFile} from "node:fs/promises"
import {validateFreshRouteState} from "../../src/lab57-route-admission"
try {
 const input=JSON.parse(await readFile(process.argv[2]!,"utf8"))
 validateFreshRouteState(input.state,false,input.followup)
 console.log(JSON.stringify({status:"FIXTURE_QUEUE_ELIGIBLE",nativeReady:false,sourceOnly:true}))
} catch {
 console.error(JSON.stringify({status:"FIXTURE_QUEUE_REFUSED",nativeReady:false,sourceOnly:true}))
 process.exitCode=2
}

// A server process that holds a Host lease until it is killed (B2.3, spike S2 `kill -9`): it starts the product's Host
// from the given resources, leases it for one session and reports, then waits for the test to kill it without
// disposing anything.
import { ServiceHost } from "../../../loginom-agent/src/host"

const [data, resources, session] = process.argv.slice(2)
await ServiceHost.start({ data, resources })
const lease = await ServiceHost.acquire(session)
if (!lease) throw Error("LOGINOM_HOST_NOT_READY")
console.log(JSON.stringify({ leased: session, generation: lease.generation }))
setInterval(() => {}, 1000)

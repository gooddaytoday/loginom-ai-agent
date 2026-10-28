import { Rpc } from "../../../src/util/rpc"
import { workerLoginomBridge } from "../../../src/cli/tui/loginom-bridge"
import { transport } from "@loginom-ai-agent/loginom-host/transport"

const bridge = workerLoginomBridge((data) => Rpc.emit("loginom.request", data))
const host = transport(bridge.port)

export const rpc = {
  loginomReply(input: { data?: unknown; closed?: boolean }) {
    bridge.receive(input)
  },
  async hostRequest(input: string) {
    try {
      return await host.request("echo", input)
    } catch (error) {
      return error instanceof Error ? error.message : "UNKNOWN"
    }
  },
  echo(input: string) {
    return input
  },
  fail() {
    throw new Error("private-worker-error")
  },
  wait() {
    return new Promise<void>(() => {})
  },
}
Rpc.listen(rpc)

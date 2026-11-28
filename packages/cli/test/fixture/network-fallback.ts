import { Server } from "node:http"
import { Effect } from "effect"
import { ServerProcess } from "../../src/server-process"

const denied = Number(process.argv[2])

if (denied > 0) {
  const listen = Server.prototype.listen
  Server.prototype.listen = function (this: Server, ...args: unknown[]) {
    const [options] = args
    if (typeof options === "object" && options !== null && "port" in options && options.port === denied) {
      // Linux does not have the Windows reservation table. Fail this one bind at the socket boundary.
      queueMicrotask(() => this.emit("error", Object.assign(new Error("Reserved port"), { code: "EACCES" })))
      return this
    }
    return Function.prototype.apply.call(listen, this, args)
  }
}

await Effect.runPromise(ServerProcess.run({ mode: "service" }, "win32"))

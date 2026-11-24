import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Global } from "@opencode/util/global"

// The product plugin keeps its folders under `Global.Path.data`: dashboards (B2.9b), file profiles, retained tool output.
// `@opencode/util/global` computes it once, when it is first imported, from the runner's `XDG_DATA_HOME` or `HOME`, so a
// variable set inside a test would not move it. A test that makes such folders points the value itself at a directory of
// its own under the system temporary directory and puts the previous value back: it never writes into the runner's data
// directory, whatever its environment.
export async function temporaryData() {
  const previous = Global.Path.data
  const directory = await realpath(await mkdtemp(join(tmpdir(), "loginom-agent-data-")))
  Global.Path.data = directory
  return {
    directory,
    async [Symbol.asyncDispose]() {
      Global.Path.data = previous
      await rm(directory, { recursive: true, force: true })
    },
  }
}

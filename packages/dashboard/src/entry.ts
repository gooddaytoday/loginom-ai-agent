import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { startDashboard } from "./web/server.ts"
import { scanPublications } from "./publisher/index.ts"
import { buildNext } from "./builder/index.ts"
import { createEventLog } from "./log.ts"

export { appHeaders, bindingKey } from "./web/server.ts"

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jobsIn = process.env.DASHBOARD_JOBS_IN ?? "/jobs-in"
  const jobsOut = process.env.DASHBOARD_JOBS_OUT ?? "/jobs-out"
  if (process.argv[2] === "web") startDashboard(process.env, await readFile(new URL("./shell.js", import.meta.url)))
  else if (process.argv[2] === "publisher") {
    const builderImage = process.env.DASHBOARD_BUILDER_IMAGE
    if (!builderImage || !/^sha256:[a-f0-9]{64}$/.test(builderImage)) throw Error("Missing or invalid installed builder image ID")
    const publications = {
      storage: process.env.DASHBOARD_STORAGE ?? "/storage", builds: process.env.DASHBOARD_BUILDS ?? "/builds",
      jobsIn, jobsOut, events: createEventLog("publisher"), builderImage,
    }
    await scanPublications({ ...publications, restart: true })
    while (true) {
      await setTimeout(10_000)
      await scanPublications(publications)
    }
  } else if (process.argv[2] === "builder") {
    while (true) {
      const jobs = (await readdir(jobsIn)).filter(name => /^[a-f0-9]{64}$/.test(name))
      if (jobs.length && !await access(join(jobsOut, jobs[0]!, "result.json")).then(() => true, () => false)) break
      await setTimeout(1000)
    }
    await buildNext({ jobsIn, jobsOut, template: process.env.DASHBOARD_TEMPLATE ?? "/opt/dashboard/template", node: process.execPath })
  } else throw Error("Usage: server.mjs web|publisher|builder")
}

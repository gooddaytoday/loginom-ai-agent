import { resolveSystemProxy } from "../src/system-proxy"

const result = await resolveSystemProxy({ environment: process.env, deadlineMs: 8000 })
const target = result.summary.http ?? result.summary.https ?? ""
console.log(`system proxy: ${result.state}${target ? ` ${target}` : ""}`)
for (const notice of result.notices) console.log(`system proxy notice: ${notice.code}`)

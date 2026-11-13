import { onState } from "./loginom.js"
onState(() => { setTimeout(() => { throw new Error("boom") }, 0) })

import { onState } from "./loginom.js"
onState(() => { document.body.append(Object.assign(new Image(), { src: "http://attacker.localhost:1/x" })) })

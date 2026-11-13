addEventListener("message", event => {
  if (event.source !== parent || event.data?.type !== "loginom-dashboard/init" || event.ports.length !== 1) return
  window.port = event.ports[0]
  window.port.onmessage = event => { window.state = event.data }
})
parent.postMessage({ type: "loginom-dashboard/ready", version: 1 }, "*")

async function attempt(action) {
  try { return await action() ? "leaked" : "blocked" }
  catch { return "blocked" }
}

async function denied(action, name) {
  try { await action(); return "leaked" }
  catch (error) {
    if (error instanceof DOMException && error.name === name) return "blocked"
    throw error
  }
}

window.attacks = {
  parent: () => attempt(() => parent.document),
  bg: () => attempt(() => parent.bg),
  frameElement: () => attempt(() => frameElement),
  credentials: () => denied(() => navigator.credentials.get({ password: true }), "NotAllowedError"),
  storage: () => attempt(() => localStorage),
  cookie: () => denied(() => document.cookie, "SecurityError"),
  fetch: target => attempt(() => fetch(target)),
  // Queue acceptance is not delivery; the test observes CSP and actual TCP/HTTP traffic.
  beacon: target => attempt(() => { navigator.sendBeacon(target, "stolen") }),
  websocket: target => new Promise(resolve => {
    let socket
    try { socket = new WebSocket(target.replace(/^http/, "ws")) }
    catch { return resolve("blocked") }
    const timer = setTimeout(() => { socket.close(); resolve("blocked") }, 500)
    socket.onopen = () => { clearTimeout(timer); socket.close(); resolve("leaked") }
    socket.onerror = () => { clearTimeout(timer); resolve("blocked") }
  }),
  image: target => new Promise(resolve => {
    const image = new Image()
    const timer = setTimeout(() => resolve("blocked"), 500)
    image.onload = () => { clearTimeout(timer); resolve("leaked") }
    image.onerror = () => { clearTimeout(timer); resolve("blocked") }
    image.src = target
  }),
  webrtc: async target => {
    const urls = "stun:" + new URL(target).host
    let rtc
    try { rtc = new RTCPeerConnection({ iceServers: [{ urls }] }) }
    catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return "blocked"
      throw error
    }
    try {
      rtc.createDataChannel("stolen")
      await rtc.setLocalDescription(await rtc.createOffer())
      const candidate = rtc.addIceCandidate({ candidate: "candidate:1 1 UDP 1 192.0.2.1 9 typ host", sdpMid: "0" })
      if (candidate === undefined) return "blocked"
      await candidate.catch(() => {})
      return "leaked"
    } finally { rtc.close() }
  },
  preconnect: target => {
    const link = document.createElement("link")
    link.rel = "preconnect"
    link.href = target
    document.head.append(link)
    return "blocked"
  },
  navigate: target => { location.href = target; return "blocked" },
  top: target => attempt(() => { top.location = target }),
  open: target => attempt(() => window.open(target)),
  form: target => {
    const form = document.createElement("form")
    form.method = "POST"
    form.action = target
    document.body.append(form)
    form.submit()
    return "blocked"
  },
  modal: () => { alert("x"); return prompt("x") === null ? "blocked" : "leaked" },
  sibling: () => {
    location.href = new URL(`/apps/${"c".repeat(64)}/${"b".repeat(64)}/`, location.href).href
    return "blocked"
  },
  forgedState: () => {
    parent.postMessage({ type: "state", parameters: [{ name: "MinBudget", value: 1 }], table: null, error: null, busy: false }, "*")
    return "blocked"
  },
  secondReady: () => { parent.postMessage({ type: "loginom-dashboard/ready", version: 1 }, "*"); return "blocked" },
  flood: () => { for (let index = 0; index < 60; index++) parent.postMessage({ type: "ignored" }, "*"); return "blocked" },
  huge: () => { parent.postMessage("x".repeat(20_000_000), "*"); return "blocked" },
  uncloneable: () => {
    try { parent.postMessage({ f() {} }, "*"); return "leaked" }
    catch (error) { return error.name }
  },
}

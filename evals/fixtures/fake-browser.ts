process.on("SIGINT", () => {})
process.on("SIGTERM", () => {})
if (process.env.EVAL_FAKE_BROWSER_CLEAR_TITLE) setTimeout(() => { process.title = "" }, 400)
setInterval(() => {}, 1000)

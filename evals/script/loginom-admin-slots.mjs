// Passed directly to page.evaluate: keep native globals inside the callback.
export async function closeSlotUserSession(input) {
  if (!input || Object.keys(input).length !== 2 || typeof input.username !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.username) || typeof input.name !== "string" ||
    !input.name.startsWith(input.username + ":") || input.name.length <= input.username.length + 1 || /[\r\n\0]/.test(input.name))
    return { outcome: "not_applied", data: { code: "ADMIN_REQUEST_INVALID" } }
  let applied = false
  try {
    const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
    const user = await session.CurrentUser
    if (!await user.IsAdmin || await user.Name === input.username)
      return { outcome: "not_applied", data: { code: "ADMIN_IDENTITY_CHANGED" } }
    const manager = await (await bg.ScopeGetObjectAsync(session, bg.IBGDeductorSessionsManagerContainer)).GetSessionsManager()
    await manager.UpdateSessionInfos()
    const matches = []
    for (let index = 0; index < await manager.Count; index++) {
      const row = await manager.SessionInfo(index)
      if (await row.Name === input.name) matches.push(row)
    }
    if (matches.length > 1) return { outcome: "not_applied", data: { code: "SESSION_IDENTITY_AMBIGUOUS" } }
    if (matches.length) {
      if (await matches[0].PendingDisconnect !== true)
        return { outcome: "not_applied", data: { code: "SESSION_NOT_IDLE" } }
      applied = true
      if (!await manager.CloseSession(matches[0], 5000)) throw Error("close")
    }
    await manager.UpdateSessionInfos()
    for (let index = 0; index < await manager.Count; index++) {
      if (await (await manager.SessionInfo(index)).Name === input.name)
        return { outcome: "unknown", data: { code: "SESSION_STILL_PRESENT" } }
    }
    return { outcome: "confirmed", data: { closed: true } }
  } catch { return { outcome: applied ? "unknown" : "not_applied", data: { code: "SESSION_CLOSE_UNKNOWN" } } }
}

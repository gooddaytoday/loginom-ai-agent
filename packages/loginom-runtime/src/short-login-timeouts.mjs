export const loginSubmitTimeout = 5_000
export const loginResponseTimeout = 30_000
export const loginLogoutTimeout = 10_000
export const runtimeExitTimeout = 5_000

// Include local browser cleanup and process exit after the guarded login and logout.
export const shortLoginShutdownTimeout =
  loginSubmitTimeout + loginResponseTimeout + loginLogoutTimeout + 5_000 + runtimeExitTimeout

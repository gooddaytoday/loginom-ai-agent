import { net, type AuthInfo, type Session } from "electron"

export function updateRequest(
  url: string,
  session: Session,
  login: (auth: AuthInfo, callback: (username: string, password: string) => void) => void,
) {
  const request = net.request({ url, session, redirect: "manual" })
  request.on("login", login)
  let redirects = 0
  request.on("redirect", (_status, _method, location) => {
    if (++redirects > 5 || URL.parse(location)?.protocol !== "https:") {
      request.emit("error", Error("LOGINOM_UPDATE_REDIRECT_INVALID"))

      return
    }

    request.followRedirect()
  })

  return request
}

export type DeepLinkWindow = { readonly status: "loading" } | { readonly status: "ready"; readonly clientID: number }

export type DeepLink =
  | { readonly status: "queued"; readonly url: string }
  | {
      readonly status: "delivered"
      readonly url: string
      readonly clientID: number
      readonly attempt: number
    }

export type DeepLinkState = {
  readonly windows: Readonly<Record<string, DeepLinkWindow>>
  readonly focusedWindowID: string | undefined
  readonly links: readonly DeepLink[]
  readonly nextAttempt: number
}

export type DeepLinkEvent =
  | { readonly type: "links.received"; readonly urls: readonly string[] }
  | { readonly type: "window.opened"; readonly windowID: string }
  | { readonly type: "window.focused"; readonly windowID: string }
  | { readonly type: "window.ready"; readonly windowID: string; readonly clientID: number }
  | { readonly type: "window.closed"; readonly windowID: string }
  | { readonly type: "client.disconnected"; readonly clientID: number }
  | { readonly type: "delivery.acknowledged"; readonly clientID: number; readonly attempt: number }

export type DeepLinkCommand =
  | {
      readonly type: "links.deliver"
      readonly windowID: string
      readonly clientID: number
      readonly attempt: number
      readonly urls: readonly string[]
    }
  | { readonly type: "window.focus"; readonly windowID: string }

export type DeepLinkTransition = {
  readonly state: DeepLinkState
  readonly commands: readonly DeepLinkCommand[]
}

export function createDeepLinkState(): DeepLinkState {
  return { windows: {}, focusedWindowID: undefined, links: [], nextAttempt: 1 }
}

export function transitionDeepLinks(state: DeepLinkState, event: DeepLinkEvent): DeepLinkTransition {
  switch (event.type) {
    case "links.received": {
      if (event.urls.length === 0) return unchanged(state)
      const links = event.urls.map((url): DeepLink => ({ status: "queued", url }))
      const focus = preferredWindowID(state)
      const next = drain({ ...state, links: [...state.links, ...links] })

      return {
        state: next.state,
        commands: focus ? [...next.commands, { type: "window.focus", windowID: focus }] : next.commands,
      }
    }

    case "window.opened": {
      if (state.windows[event.windowID]) return unchanged(state)

      return drain({ ...state, windows: { ...state.windows, [event.windowID]: { status: "loading" } } })
    }

    case "window.focused": {
      if (!state.windows[event.windowID] || state.focusedWindowID === event.windowID) return unchanged(state)

      return drain({ ...state, focusedWindowID: event.windowID })
    }

    case "window.ready": {
      const current = state.windows[event.windowID]

      if (current?.status === "ready" && current.clientID === event.clientID) return unchanged(state)

      return drain({
        ...state,
        windows: { ...state.windows, [event.windowID]: { status: "ready", clientID: event.clientID } },
        links: current?.status === "ready" ? requeue(state.links, current.clientID) : state.links,
      })
    }

    case "window.closed": {
      const current = state.windows[event.windowID]

      if (!current) return unchanged(state)

      return drain({
        ...state,
        windows: Object.fromEntries(Object.entries(state.windows).filter(([id]) => id !== event.windowID)),
        focusedWindowID: state.focusedWindowID === event.windowID ? undefined : state.focusedWindowID,
        links: current.status === "ready" ? requeue(state.links, current.clientID) : state.links,
      })
    }

    case "client.disconnected": {
      const windowID = Object.entries(state.windows).find(
        ([, window]) => window.status === "ready" && window.clientID === event.clientID,
      )?.[0]

      const delivered = state.links.some((link) => link.status === "delivered" && link.clientID === event.clientID)

      if (!windowID && !delivered) return unchanged(state)

      return drain({
        ...state,
        windows: windowID ? { ...state.windows, [windowID]: { status: "loading" } } : state.windows,
        links: requeue(state.links, event.clientID),
      })
    }

    case "delivery.acknowledged": {
      // An acknowledged link leaves the state, so no later renderer can receive it again.
      const links = state.links.filter(
        (link) => link.status !== "delivered" || link.clientID !== event.clientID || link.attempt !== event.attempt,
      )

      if (links.length === state.links.length) return unchanged(state)

      return { state: { ...state, links }, commands: [] }
    }
  }
}

// The window a link opens in: the focused one, else the first open one.
function preferredWindowID(state: DeepLinkState) {
  return state.focusedWindowID ?? Object.keys(state.windows)[0]
}

// Sends queued links to the preferred window as soon as it is ready.
function drain(state: DeepLinkState): DeepLinkTransition {
  const windowID = preferredWindowID(state)
  const window = windowID ? state.windows[windowID] : undefined

  if (!windowID || window?.status !== "ready") return unchanged(state)
  const urls = state.links.flatMap((link) => (link.status === "queued" ? [link.url] : []))

  if (urls.length === 0) return unchanged(state)
  const attempt = state.nextAttempt
  const clientID = window.clientID

  const links = state.links.map(
    (link): DeepLink => (link.status === "queued" ? { status: "delivered", url: link.url, clientID, attempt } : link),
  )

  return {
    state: { ...state, links, nextAttempt: attempt + 1 },
    commands: [{ type: "links.deliver", windowID, clientID, attempt, urls }],
  }
}

// A renderer that went away without acknowledging may not have handled its links, so they wait for the next one.
function requeue(links: readonly DeepLink[], clientID: number) {
  return links.map(
    (link): DeepLink =>
      link.status === "delivered" && link.clientID === clientID ? { status: "queued", url: link.url } : link,
  )
}

function unchanged(state: DeepLinkState): DeepLinkTransition {
  return { state, commands: [] }
}

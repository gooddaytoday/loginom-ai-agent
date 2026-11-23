import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { createDesktopNotify } from "./notifications"

const originalNotification = globalThis.Notification

const created: FakeNotification[] = []

const events: string[] = []

class FakeNotification extends EventTarget implements Notification {
  static readonly permission: NotificationPermission = "granted"

  static async requestPermission(): Promise<NotificationPermission> {
    return "granted"
  }

  onclick: ((this: Notification, ev: Event) => void) | null = null
  onclose: ((this: Notification, ev: Event) => void) | null = null
  onerror: ((this: Notification, ev: Event) => void) | null = null
  onshow: ((this: Notification, ev: Event) => void) | null = null

  readonly body: string
  readonly data = null
  readonly dir: NotificationDirection = "auto"
  readonly icon: string
  readonly lang = ""
  readonly silent: boolean | null
  readonly tag = ""
  readonly title: string

  constructor(title: string, options?: NotificationOptions) {
    super()
    this.title = title
    this.body = options?.body ?? ""
    this.icon = options?.icon ?? ""
    this.silent = options?.silent ?? null
    events.push(`created:${title}:${this.body}`)
    created.push(this)
  }

  close() {
    events.push("notification.close")
    this.onclose?.call(this, new Event("close"))
  }
}

afterEach(() => {
  created.length = 0
  events.length = 0
  globalThis.Notification = originalNotification
})

describe("desktop notifications", () => {
  test("shows and focuses the window on click, runs the callback, and closes the notification", async () => {
    globalThis.Notification = FakeNotification

    const notify = createDesktopNotify({
      getWindowFocused: async () => false,
      showWindow: async () => {
        events.push("api.showWindow")
      },
      setWindowFocus: async () => {
        events.push("api.setWindowFocus")
      },
    })

    await notify("Response ready", "Refactor auth flow", () => {
      events.push("session.select")
    })

    const notification = created[0]
    expect(notification).toBeDefined()

    notification?.onclick?.call(notification, new Event("click"))

    expect(events).toEqual([
      "created:Response ready:Refactor auth flow",
      "api.showWindow",
      "api.setWindowFocus",
      "session.select",
      "notification.close",
    ])
    expect(notification?.onclick).toBeNull()
    expect(notification?.onclose).toBeNull()
    expect(notification?.onerror).toBeNull()
  })

  test.each([{ event: "close" as const }, { event: "error" as const }])(
    "releases the Notification handlers when $event fires without a click",
    async ({ event }) => {
      globalThis.Notification = FakeNotification

      const notify = createDesktopNotify({
        getWindowFocused: async () => false,
        showWindow: async () => {},
        setWindowFocus: async () => {},
      })

      await notify("Session error")

      const notification = created[0]
      expect(notification).toBeDefined()

      if (event === "close") {
        notification?.onclose?.call(notification, new Event("close"))
      } else {
        notification?.onerror?.call(notification, new Event("error"))
      }

      expect(notification?.onclick).toBeNull()
      expect(notification?.onclose).toBeNull()
      expect(notification?.onerror).toBeNull()
    },
  )

  // Loginom AI Agent (B4.12): the icon is the product's own file the renderer serves from its publicDir (app/public),
  // the same one the web notifications use since B4.6, so showing a notification requests nothing from opencode.ai.
  test("shows the product icon the renderer serves, not a remote one", async () => {
    globalThis.Notification = FakeNotification

    await createDesktopNotify({
      getWindowFocused: async () => false,
      showWindow: async () => {},
      setWindowFocus: async () => {},
    })("Response ready")

    const icon = created[0]?.icon ?? ""
    expect(icon).toBe("/loginom-icon.png")
    expect(await Bun.file(path.resolve(import.meta.dirname, "../../../../app/public", `.${icon}`)).exists()).toBe(true)
  })

  test("suppresses desktop notifications while the window is already focused", async () => {
    globalThis.Notification = FakeNotification

    const notify = createDesktopNotify({
      getWindowFocused: async () => true,
      showWindow: async () => {},
      setWindowFocus: async () => {},
    })

    await notify("Response ready", "Active session")
    expect(events).toEqual([])
    expect(created).toEqual([])
  })
})

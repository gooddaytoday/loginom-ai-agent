import type { Page } from "@playwright/test"

type RecordedNotification = { title: string; body?: string }

export async function recordNotifications(page: Page, options: { autoShow?: boolean } = {}) {
  const attempts: RecordedNotification[] = []

  const notifications: RecordedNotification[] = []

  const sounds: string[] = []

  await page.exposeBinding(
    "recordNotification",
    (_source, event: "attempt" | "show", notification: RecordedNotification) => {
      if (event === "attempt") attempts.push(notification)
      else notifications.push(notification)
    },
  )
  await page.exposeBinding("recordNotificationSound", (_source, src: string) => {
    sounds.push(src)
  })
  await page.addInitScript((autoShow) => {
    // SAFETY: exposeBinding above installs these callbacks before the app starts.
    const host: Window & {
      recordNotification?: (event: "attempt" | "show", notification: RecordedNotification) => Promise<void>
      recordNotificationSound?: (src: string) => Promise<void>
    } = window

    document.hasFocus = () => false
    let clickLatest: (() => void) | undefined
    let failLatest: (() => void) | undefined
    window.addEventListener("test:notification-click", () => clickLatest?.())
    window.addEventListener("test:notification-error", () => failLatest?.())
    Object.defineProperty(window, "Notification", {
      value: class extends EventTarget {
        static permission = "granted"
        onclick: (() => void) | null = null

        constructor(title: string, options?: NotificationOptions) {
          super()
          clickLatest = () => this.onclick?.()
          failLatest = () => this.dispatchEvent(new Event("error"))
          const notification = { title, body: options?.body }

          void host.recordNotification!("attempt", notification)
          this.addEventListener("show", () => void host.recordNotification!("show", notification), { once: true })

          if (autoShow) queueMicrotask(() => this.dispatchEvent(new Event("show")))
        }

        close() {}
      },
    })
    Object.defineProperty(window, "Audio", {
      value: class {
        currentTime = 0

        constructor(readonly src: string) {}

        play() {
          return host.recordNotificationSound!(this.src)
        }

        pause() {}
      },
    })
  }, options.autoShow ?? true)

  return {
    attempts,
    notifications,
    sounds,
    clickLatest: () => page.evaluate(() => window.dispatchEvent(new Event("test:notification-click"))),
    failLatest: () => page.evaluate(() => window.dispatchEvent(new Event("test:notification-error"))),
  }
}

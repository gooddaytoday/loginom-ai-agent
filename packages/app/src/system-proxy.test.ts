import { expect, test } from "bun:test"
import { proxyToastKey } from "./system-proxy"

test("only user-facing proxy failures become toasts", () => {
  expect(proxyToastKey("read-failed")).toBe("systemProxy.notice.read-failed")
  expect(proxyToastKey("unreachable")).toBe("systemProxy.notice.unreachable")
  expect(proxyToastKey("rules-skipped")).toBeUndefined()
  expect(proxyToastKey("approximated")).toBeUndefined()
})

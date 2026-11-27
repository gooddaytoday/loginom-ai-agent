import { expect, test } from "bun:test"
import { createDeepLinkQueue, protocolUrls } from "./deep-links"

test("delivers startup and second-instance links once to their own windows", () => {
  const cold = "loginom-ai-agent://dashboard?id=1&action=create"
  const warm = "loginom-ai-agent://dashboard?id=2&action=edit"
  const first = {},
    second = {}
  const queue = createDeepLinkQueue(["/opt/Desktop", cold])
  queue.restore(first)
  queue.add(second, [warm])
  expect(queue.take(second)).toEqual({ urls: [warm] })
  expect(queue.take(first)).toEqual({ urls: [cold], coldDashboard: cold })
  expect(queue.take(first)).toEqual({ urls: [] })
  expect(queue.take(second)).toEqual({ urls: [] })
})

test("opens a startup dashboard link in the form Windows passes it", () => {
  const link = "loginom-ai-agent://dashboard?id=1&action=create"
  const queue = createDeepLinkQueue([
    "C:\\Program Files\\Example\\loginom-ai-agent.exe",
    "loginom-ai-agent://dashboard/?id=1&action=create",
  ])
  const win = {}
  queue.restore(win)
  expect(queue.take(win)).toEqual({ urls: [link], coldDashboard: link })
  expect(protocolUrls(["loginom-ai-agent://dashboard/publish?id=1&action=create"])).toEqual([
    "loginom-ai-agent://dashboard/publish?id=1&action=create",
  ])
})

test("opens a dashboard link that arrives before the first window like a cold start", () => {
  const link = "loginom-ai-agent://dashboard?id=1&action=create"
  const queue = createDeepLinkQueue(["/Applications/Example.app/Contents/MacOS/Example"])
  queue.add(undefined, [link])
  const win = {}
  queue.restore(win)
  expect(queue.take(win)).toEqual({ urls: [link], coldDashboard: link })
})

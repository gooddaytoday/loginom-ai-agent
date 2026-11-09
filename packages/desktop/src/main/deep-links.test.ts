import { expect, test } from "bun:test"
import { createDeepLinkQueue } from "./deep-links"

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

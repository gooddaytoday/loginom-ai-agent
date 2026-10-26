import { expect, test } from "bun:test"
import { describeProxyFailure } from "../../src/util/proxy-error"

test("proxy failures keep stable codes", () => {
  expect(describeProxyFailure(new Error("407 Proxy Authentication Required"))).toBe("auth-required")
  expect(describeProxyFailure(new Error("connect ECONNREFUSED 127.0.0.1:8080"))).toBe("unreachable")
  expect(describeProxyFailure(new Error("tunneling socket could not be established"))).toBe("tunnel")
  expect(describeProxyFailure(new Error("404 missing"))).toBeUndefined()
})

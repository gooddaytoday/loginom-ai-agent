import { describe, expect, test } from "bun:test"
import { formatLimitReset } from "./usage-exceeded-dialogs"

describe("formatLimitReset", () => {
  test("shows a monthly Go limit's reset weeks out", () => {
    const created = Date.now()
    expect(formatLimitReset("en-US", created, 25 * 86_400_000)).toBeDefined()
    expect(formatLimitReset("en-US", created, 60 * 86_400_000)).toBeUndefined()
  })
})

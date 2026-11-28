import { describe, expect, test } from "bun:test"
import { dict as uiEnglish } from "@opencode/ui/i18n/en"
import { dict as uiRussian } from "@opencode/ui/i18n/ru"
import { DESKTOP_NATIVE_LOCALES } from "./desktop-native"
import { dict as appEnglish } from "./en"
import { dict as appRussian } from "./ru"
import { loadInitialLocale, localizedListParts, richTemplateParts } from "./language"

describe("rich translations", () => {
  test("lets the translated phrase position a rich slot", () => {
    const names = { type: "names" }
    expect(richTemplateParts("Written by {{names}}", { names })).toEqual(["Written by ", names])
    expect(richTemplateParts("{{names}} tarafından yazıldı", { names })).toEqual([names, " tarafından yazıldı"])
  })

  test("keeps list elements intact while localizing punctuation", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the check is that no element was stringified
    expect(localizedListParts("en", items).filter((part) => typeof part !== "string")).toEqual(items)
  })
})

describe("dictionaries", () => {
  test("starts in Russian with no saved language", async () => {
    expect(await loadInitialLocale()).toBe("ru")
  })

  test.each([
    { name: "app", english: appEnglish, russian: appRussian },
    { name: "UI", english: uiEnglish, russian: uiRussian },
  ])("covers every English key in the Russian $name dictionary", ({ english, russian }) => {
    expect(Object.keys(english).filter((key) => !Object.hasOwn(russian, key))).toEqual([])
  })

  test("are flat string maps in every locale", async () => {
    const modules = await Promise.all(
      DESKTOP_NATIVE_LOCALES.flatMap((locale) => [
        import(`./${locale}`),
        import(`../../../../ui/src/i18n/${locale}`),
      ]),
    )

    const nested = modules.flatMap((module) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the check is that no value is nested
      Object.entries<unknown>(module.dict).filter(([, value]) => typeof value !== "string"),
    )

    expect(nested).toEqual([])
  })
})

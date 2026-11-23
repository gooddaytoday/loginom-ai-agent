import { describe, expect, test } from "bun:test"
import { Product } from "@loginom-ai-agent/product"
import { DESKTOP_MENU } from "@/shell/commands/desktop-menu"
import {
  createDesktopNativeBundle,
  DESKTOP_NATIVE_ENGLISH,
  DESKTOP_NATIVE_KEYS,
  DESKTOP_NATIVE_LOCALES,
  DESKTOP_NATIVE_LOCALE_TAGS,
  detectDesktopNativeLocale,
  DESKTOP_NATIVE_MAX_PAYLOAD_BYTES,
  formatDesktopNativeMessage,
  parseDesktopNativeBundle,
} from "./desktop-native"
import en from "./en"
import { dict } from "./ru"

describe("desktop native translations", () => {
  test("accepts the exact typed bundle", () => {
    const bundle = createDesktopNativeBundle("en", (key) => DESKTOP_NATIVE_ENGLISH[key])
    expect(parseDesktopNativeBundle(bundle)).toEqual(bundle)
  })

  test("rejects unsupported locales and mismatched key sets", () => {
    const bundle = createDesktopNativeBundle("en", (key) => DESKTOP_NATIVE_ENGLISH[key])
    expect(parseDesktopNativeBundle({ ...bundle, locale: "en-US" })).toBeUndefined()
    expect(
      parseDesktopNativeBundle({
        ...bundle,
        messages: Object.fromEntries(DESKTOP_NATIVE_KEYS.slice(1).map((key) => [key, bundle.messages[key]])),
      }),
    ).toBeUndefined()
    expect(parseDesktopNativeBundle({ ...bundle, messages: { ...bundle.messages, extra: "no" } })).toBeUndefined()
    expect(
      parseDesktopNativeBundle({
        ...bundle,
        messages: { ...bundle.messages, [DESKTOP_NATIVE_KEYS[0]]: "x".repeat(DESKTOP_NATIVE_MAX_PAYLOAD_BYTES) },
      }),
    ).toBeUndefined()
    expect(
      parseDesktopNativeBundle({ ...bundle, messages: { ...bundle.messages, [DESKTOP_NATIVE_KEYS[0]]: 1 } }),
    ).toBeUndefined()
  })

  test("interpolates native templates without changing unknown placeholders", () => {
    expect(formatDesktopNativeMessage("{{known}} {{unknown}}", { known: "yes" })).toBe("yes {{unknown}}")
  })
})

describe("desktop native locale detection", () => {
  test("follows preference order and skips invalid or unsupported tags", () => {
    expect(detectDesktopNativeLocale(["not_a_locale", "fr-FR"])).toBe("fr")
    expect(detectDesktopNativeLocale(["eo", "de-DE"])).toBe("de")
  })

  test.each([
    [["zh-TW"], "zht"],
    [["zh-SG"], "zh"],
    [["pa-PK"], "pa"],
    [["pa-IN", "fr"], "fr"],
    [["az-Cyrl", "de"], "de"],
    [["sr-Cyrl"], "sr"],
    [["sr-Latn", "en"], "en"],
    [["uz-Latn"], "uz"],
    [["no"], "no"],
    [["nb-NO"], "no"],
    [["nn-NO"], "no"],
    [["he"], "he"],
    [["he-IL"], "he"],
  ])("uses Unicode likely subtags to map %p to %p", (tags, locale) => {
    expect<string | undefined>(detectDesktopNativeLocale([...tags])).toBe(locale)
  })
})

describe("desktop native ICU data", () => {
  test("accepts every locale in standard Intl formatters", () => {
    for (const locale of DESKTOP_NATIVE_LOCALES) {
      const tag = DESKTOP_NATIVE_LOCALE_TAGS[locale]
      expect(() => new Intl.Locale(tag), `${locale} locale`).not.toThrow()
      expect(() => new Intl.NumberFormat(tag), `${locale} number`).not.toThrow()
      expect(() => new Intl.DateTimeFormat(tag), `${locale} date`).not.toThrow()
      expect(() => new Intl.PluralRules(tag), `${locale} plural`).not.toThrow()
      expect(() => new Intl.ListFormat(tag), `${locale} list`).not.toThrow()
      expect(() => new Intl.DisplayNames(tag, { type: "language" }), `${locale} names`).not.toThrow()
      expect(() => new Intl.Segmenter(tag), `${locale} segmenter`).not.toThrow()
    }
  })
})

describe("desktop product name", () => {
  // Install CLI still links the `opencode` command (`desktop-cli.ts`); the message names it until the bundled CLI is renamed.
  const commandNames = ["desktop.cli.installed.message"]

  test("names the product in the en and ru desktop strings", () => {
    const upstream = [en, dict].flatMap((messages) =>
      Object.entries(messages).filter(
        ([key, value]) => key.startsWith("desktop.") && !commandNames.includes(key) && /opencode/i.test(value),
      ),
    )

    expect(upstream).toEqual([])
    expect(DESKTOP_NATIVE_ENGLISH["desktop.menu.app"]).toBe("Loginom AI Agent")
  })

  test("names the product in the en and ru updater strings", async () => {
    const catalogs = await Promise.all(
      ["en", "ru"].map((locale) => import(`../../../../gui-plugins/src/updater/i18n/${locale}`)),
    )

    const upstream = catalogs.flatMap((module) =>
      Object.entries<string>(module.default).filter(([, value]) => /opencode/i.test(value)),
    )

    expect(upstream).toEqual([])
  })

  test("names the product in the en and ru About strings", () => {
    // About no longer shows the trademark line: the product's own wording waits for the owner.
    const upstream = [en, dict].flatMap((messages) =>
      Object.entries(messages).filter(
        ([key, value]) =>
          key.startsWith("settings.about.") && key !== "settings.about.trademark" && /opencode/i.test(value),
      ),
    )

    expect(upstream).toEqual([])
  })

  test("leads the Help menu to the product, as 0.4 did", () => {
    const help = DESKTOP_MENU.find((menu) => menu.id === "help")?.items ?? []

    expect(help.flatMap((entry) => (entry.type === "item" && entry.href ? [entry.href] : []))).toEqual([
      Product.documentation,
      Product.support,
      Product.support,
      Product.support,
    ])
  })
})

import { Plugin } from "@opencode/plugin/gui"
import { dict as en } from "./i18n/en"
import { dict as ru } from "./i18n/ru"

import turnEn from "./i18n/turn-en"
import turnRu from "./i18n/turn-ru"

export default Plugin.define({ i18n: { en: { ...en, ...turnEn }, ru: { ...ru, ...turnRu } } })

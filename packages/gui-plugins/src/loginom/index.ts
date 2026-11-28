import { Plugin } from "@opencode/plugin/gui"
import en from "./i18n/en"
import ru from "./i18n/ru"

export { loginomId, SystemProxy, type SystemProxySetting } from "./contract"

export default Plugin.define({ i18n: { en, ru } })

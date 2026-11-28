import { builtins } from "../../../gui-plugins/src/renderer"
import { pagePlugin } from "../../component-tests/page-plugin.fixture"

const enabled = localStorage.getItem("opencode.e2e.disable-loginom-gui")
  ? builtins.filter((item) => item.id !== "loginom-gui")
  : builtins

const fixtureBuiltins = localStorage.getItem("opencode.e2e.page-plugin") ? [...enabled, pagePlugin()] : enabled

export { fixtureBuiltins as builtins }

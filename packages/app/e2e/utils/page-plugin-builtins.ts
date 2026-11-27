import { builtins } from "../../../gui-plugins/src/renderer"
import { pagePlugin } from "../../component-tests/page-plugin.fixture"

const fixtureBuiltins = localStorage.getItem("opencode.e2e.page-plugin") ? [...builtins, pagePlugin()] : builtins

export { fixtureBuiltins as builtins }

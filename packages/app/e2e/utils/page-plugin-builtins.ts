import { builtins } from "../../../gui-plugins/src/renderer"
import { pagePlugin } from "../../component-tests/page-plugin.fixture"

const fixture = localStorage.getItem("opencode.e2e.page-plugin")

const fixtureBuiltins = fixture ? [...builtins, pagePlugin({ packageAction: fixture === "packages" })] : builtins

export { fixtureBuiltins as builtins }

import { builtins } from "../../../gui-plugins/src/renderer"
import { pagePlugin } from "../../component-tests/page-plugin.fixture"

import { loginomNodeFixture } from "./loginom-node-fixture"

const fixtureBuiltins = [
  ...builtins,
  ...(localStorage.getItem("opencode.e2e.page-plugin") ? [pagePlugin()] : []),
  ...(localStorage.getItem("opencode.e2e.loginom-node") ? [loginomNodeFixture] : []),
]

export { fixtureBuiltins as builtins }

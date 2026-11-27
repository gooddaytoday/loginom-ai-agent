import { app } from "electron"
import type { MainContext } from "@opencode/plugin/gui/main"
import { ManagedFolders } from "./folders"
import { managedFolders } from "./folders-main"

export default function setup(ctx: MainContext) {
  ctx.provide(ManagedFolders, managedFolders(app.getPath("documents"), app.getPath("userData")))
}

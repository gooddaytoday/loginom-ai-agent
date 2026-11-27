import { writeFile } from "node:fs/promises"
import type { Plugin } from "@opencode/plugin/gui/main"
import { dialog } from "electron"
import { reportName, ReportSave } from "./contract"

const setup: Plugin.MainSetup = (ctx) => {
  ctx.provide(ReportSave, {
    async write({ title, content }, { signal }) {
      const result = await dialog.showSaveDialog({ title, defaultPath: reportName })

      if (result.canceled || !result.filePath || signal.aborted) return null
      await writeFile(result.filePath, content, { mode: 0o600 })

      return result.filePath
    },
  })
}

export default setup

import { writeFile } from "node:fs/promises"
import type { Plugin } from "@opencode/plugin/gui/main"
import { dialog } from "electron"
import { reportName, ReportSave } from "./report-save"

const setup: Plugin.MainSetup = (ctx) => {
  ctx.provide(ReportSave, {
    async write({ title, content }) {
      const result = await dialog.showSaveDialog({ title, defaultPath: reportName })

      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, content, { mode: 0o600 })

      return result.filePath
    },
  })
}

export default setup

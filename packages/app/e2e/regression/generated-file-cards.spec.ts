import { expect, test } from "@playwright/test"
import {
  assistantMessage,
  setupTimeline,
  textPart,
  toolPart,
  userMessage,
} from "../performance/timeline-stability/fixture"

test("shows a card for a completed export confirmed by the host", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(
          "prt_export_file",
          "loginom_dock_node_wait",
          "completed",
          { operation_id: "export" },
          {
            output: JSON.stringify({
              state: "settled",
              status: "SUCCEEDED",
              output: { file_artifacts: [{ artifact_id: "csv-1", destination: "/server/result.csv" }] },
            }),
            metadata: {
              outputFiles: [{ artifact_id: "csv-1", path: "/private/download/result.csv", name: "result.csv" }],
            },
          },
        ),
      ]),
    ],
  })
  const card = page.locator('[data-tid="generated-file-card"]')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText("result.csv")
  // A browser has no native opener; the confirmed file remains visible.
  await expect(card).toBeDisabled()
})

test("model paths, server paths and unfinished exports do not become file cards", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([
        textPart("prt_invented_file", "Created /private/invented.csv"),
        toolPart(
          "prt_server_file",
          "loginom_dock_node_wait",
          "completed",
          { operation_id: "export" },
          {
            output: JSON.stringify({
              output: { file_artifacts: [{ artifact_id: "csv-1", destination: "/server/result.csv" }] },
            }),
          },
        ),
        toolPart(
          "prt_pending_file",
          "loginom_dock_node_apply",
          "running",
          {},
          {
            metadata: { outputFiles: [{ artifact_id: "pending", path: "/private/pending.csv", name: "pending.csv" }] },
          },
        ),
      ]),
    ],
  })
  await expect(page.getByText("Created /private/invented.csv", { exact: true })).toBeVisible()
  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(0)
})

test("user FilePart cards keep their original download behavior", async ({ page }) => {
  await setupTimeline(page, {
    messages: [
      userMessage([
        {
          id: "prt_user_csv",
          type: "file",
          mime: "text/csv",
          filename: "sales.csv",
          url: "data:text/csv;base64,QQoxCg==",
        },
      ]),
      assistantMessage([textPart("prt_user_csv_reply", "Attached sales.csv")]),
    ],
  })
  const attachment = page.locator('[data-slot="user-message-attachments"] [data-component="attachment-card-v2"]')
  await expect(attachment).toHaveCount(1)
  await expect(attachment).toContainText("sales.csv")
  const download = page.waitForEvent("download")
  await attachment.click()
  expect((await download).suggestedFilename()).toBe("sales.csv")
  await expect(page.locator('[data-tid="generated-file-card"]')).toHaveCount(0)
})

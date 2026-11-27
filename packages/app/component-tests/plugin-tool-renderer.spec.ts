import { expect, sourceURL, story } from "../../stories/playwright/story"
import type { mountToolRendererHost } from "./tool-renderer.fixture"

const fixture = sourceURL(new URL("./tool-renderer.fixture.tsx", import.meta.url))

for (const next of [false, true]) {
  story(
    `${next ? "New" : "Classic"} timeline isolates plugin renderers and restores the native display on unload`,
    async ({ mount, page }) => {
      await mount("ui-line-comment--editor")

      const host = await page.evaluateHandle<
        ReturnType<typeof mountToolRendererHost>,
        { fixture: string; next: boolean }
      >(
        async ({ fixture, next }) => {
          const { mountToolRendererHost } = await import(fixture)

          return mountToolRendererHost(next)
        },
        { fixture, next },
      )

      const timeline = page.getByLabel("Tool renderer timeline")
      const demo = timeline.locator('[data-timeline-part-id="demo"]')
      const failure = timeline.locator('[data-timeline-part-id="crash"] [data-kind="tool-error-card"]')
      const toolError = timeline.locator('[data-timeline-part-id="failed"] [data-kind="tool-error-card"]')
      const group = timeline.locator('[data-component="collapsed-tool-group"]')
      const trigger = group.locator(':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]')

      await expect(demo.getByRole("article", { name: "Проверка данных" })).toContainText("128 строк")
      await expect(failure).toContainText("Проверка данных")
      await failure.locator('[data-slot="collapsible-trigger"]').click()
      await expect(failure).toContainText("Could not display this tool call")
      await expect(toolError).toContainText("Проверка данных")
      await expect(timeline.getByText("Проверка завершена.")).toBeVisible()
      await expect(group).toHaveAttribute("data-timeline-part-ids", "read")

      if (!next)
        expect(await host.evaluate((value) => value.rejected())).toEqual([
          'Error: Cannot register a renderer for native tool "read"',
          'Error: Cannot register a renderer for native tool "shell"',
        ])

      await host.evaluate((value) => value.disable())
      await expect(group).toHaveAttribute("data-timeline-part-ids", "read,demo,crash,failed")
      await trigger.click()
      await expect(demo.getByRole("article")).toHaveCount(0)
      await expect(demo).toContainText("loginom_demo")
      await expect(timeline.locator('[data-timeline-part-id="failed"]')).toContainText("loginom_demo")
      await expect(timeline.getByText("Проверка завершена.")).toBeVisible()
    },
  )
}

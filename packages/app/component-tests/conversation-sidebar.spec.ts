import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./conversation-sidebar.fixture.tsx", import.meta.url))

story(
  "project folders expand independently, reveal six conversations, and show pending activity",
  async ({ mount, page }) => {
    await mount("ui-line-comment--editor")
    await page.evaluate(async (url) => (await import(url)).mountSidebar(), fixture)
    const projects = page.getByRole("region", { name: "projects" })
    const conversations = page.getByRole("region", { name: "conversations" })
    const reports = projects.getByRole("button", { name: /^Отчёты/ })
    const other = projects.getByRole("button", { name: "Другой проект" })
    await expect(reports.getByRole("img", { name: "conversationWaiting" })).toBeVisible()
    await expect(conversations.getByRole("img", { name: "conversationRunning" })).toBeVisible()
    await expect(projects.getByText("Разговор без проекта")).toHaveCount(0)
    await expect(conversations.getByText("Отчёт 1")).toHaveCount(0)

    await reports.click()
    await other.click()
    await expect(reports).toHaveAttribute("aria-expanded", "true")
    await expect(other).toHaveAttribute("aria-expanded", "true")
    await expect(projects.getByText(/^Отчёт \d+$/)).toHaveCount(6)
    await expect(projects.getByText("Отчёт 6")).toBeVisible()
    await projects.getByRole("button", { name: "showMoreConversations" }).click()
    const latest = projects.getByRole("button", { name: /^Отчёт 8/ })
    await expect(latest.getByRole("img", { name: "conversationWaiting" })).toBeVisible()
    await latest.click()
    await expect(page.locator("[data-opened]")).toHaveAttribute("data-opened", "report-7")
    await conversations.getByRole("button", { name: /^Разговор без проекта/ }).click()
    await expect(page.locator("[data-opened]")).toHaveAttribute("data-opened", "loose")
    await reports.click()
    await expect(other).toHaveAttribute("aria-expanded", "true")
    await expect(projects.getByText("Отчёт 1")).toHaveCount(0)
  },
)

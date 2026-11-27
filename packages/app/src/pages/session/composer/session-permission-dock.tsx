import { skillInstallConfirmation } from "@loginom-ai-agent/product"
import { For, Show } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/session-ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()
  const skillInstall = () => skillInstallConfirmation(props.request)
  const deletion = () => props.request.permission === "dashboard_delete"
  const publicationCount = () => props.request.metadata.publicationCount
  const confirmedRemoved = () => {
    const count = props.request.metadata.confirmedRemoved
    return typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? String(count) : undefined
  }

  const conflict = () => {
    if (props.request.permission !== "dashboard_publish") return
    const value = props.request.metadata.dashboardConflict
    if (!value || typeof value !== "object" || !("latest" in value)) return
    const latest = value.latest
    if (latest && typeof latest === "object" && "name" in latest && typeof latest.name === "string")
      return { latest: latest.name, newDraft: "base" in value && value.base === null }
  }
  const newDraftConflict = () => conflict()?.newDraft

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">{language.t("notification.permission.title")}</div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t((deletion() || newDraftConflict()) ? "dashboard.conflict.cancel" : "ui.permission.deny")}
            </Button>
            <Show when={!deletion() && props.request.always.length > 0}>
              <Button
                variant="secondary"
                size="normal"
                onClick={() => props.onDecide("always")}
                disabled={props.responding}
              >
                {language.t("ui.permission.allowAlways")}
              </Button>
            </Show>
            <Button variant="primary" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t(deletion() ? "dashboard.delete.confirm" : newDraftConflict() ? "dashboard.conflict.publishMine" : "ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={toolDescription()}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{toolDescription()}</div>
        </div>
      </Show>

      <Show when={conflict()}>
        {(version) => <div data-slot="permission-row" role="alert">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">
            {language.t(version().newDraft ? "dashboard.conflict.newDraft" : "dashboard.conflict", { latest: version().latest })}
          </div>
        </div>}
      </Show>

      <Show when={deletion()}>
        <div data-slot="permission-row" role="alert">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">
            <Show when={Number.isSafeInteger(publicationCount())}>
              <div>{language.t("dashboard.delete.count", { count: String(publicationCount()) })}</div>
            </Show>
            <Show when={confirmedRemoved()}>
              {(count) => <div>{language.t("dashboard.delete.confirmedRemoved", { count: count() })}</div>}
            </Show>
            <div>{language.t("dashboard.delete.warning")}</div>
          </div>
        </div>
      </Show>

      <Show when={skillInstall()}>
        {(lines) => <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint" class="break-all">
            <For each={lines()}>{(line) => <div>{line}</div>}</For>
          </div>
        </div>}
      </Show>

      <Show when={!skillInstall() && props.request.patterns.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.request.patterns}>
              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}

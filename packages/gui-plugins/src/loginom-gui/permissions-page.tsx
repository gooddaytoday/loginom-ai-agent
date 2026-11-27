import {
  permissionDefaults,
  permissionKinds,
  settingEffect,
  settingRules,
  type Kind,
} from "@loginom-ai-agent/product/permissions"
import { usePlugin } from "@opencode/plugin/gui"
import type { Permission } from "@opencode/schema/permission"
import { createResource, createSignal, For, onCleanup, Show } from "solid-js"
import type definition from "./index"
import { useProfileClient } from "./profile-client"

const effects = ["allow", "ask", "deny"] as const
type Settings = {
  rules: Permission.Ruleset
  policy?: Partial<Record<Kind, Permission.Effect>>
}

export default function PermissionsPage() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const client = useProfileClient()
  const lifetime = new AbortController()
  onCleanup(() => lifetime.abort())
  const signal = () => AbortSignal.any([lifetime.signal, AbortSignal.timeout(12_000)])
  const [settings, { mutate, refetch }] = createResource(client, async (server): Promise<Settings | undefined> => {
    const entries = await server.config.get(undefined, { signal: signal() }).catch(() => undefined)
    if (!entries) return
    return {
      rules: entries.flatMap((entry) =>
        entry.type === "document" && entry.profile ? (entry.info.permissions ?? []) : [],
      ),
    }
  })
  const [saving, setSaving] = createSignal(false)
  const [failed, setFailed] = createSignal(false)

  async function save(permissions: Permission.Ruleset) {
    const server = client()
    const current = settings()
    if (!server || !current || !permissions.length || saving()) return
    setFailed(false)
    setSaving(true)
    mutate({ ...current, rules: [...current.rules, ...permissions] })
    try {
      await server.experimental.config.update({ permissions }, { signal: signal() })
    } catch {
      if (client() === server && !lifetime.signal.aborted) {
        mutate(current)
        setFailed(true)
        void refetch()
      }
    } finally {
      if (!lifetime.signal.aborted) setSaving(false)
    }
  }

  const policy = (kind: Kind) => settings()?.policy?.[kind]
  const current = (kind: Kind) => policy(kind) ?? settingEffect(kind, settings()?.rules ?? [])
  const label = (effect: ReturnType<typeof current>) => ctx.t(`permission_${effect}`)
  const mark = (kind: Kind) => {
    if (policy(kind)) return ctx.t("permissionManaged")
    if (!settings()?.policy) return
    return current(kind) === permissionDefaults[kind]
      ? ctx.t("permissionDefault")
      : ctx.t("permissionChanged", { effect: label(permissionDefaults[kind]) })
  }
  const disabled = (kind: Kind) => saving() || settings.loading || !!policy(kind)

  return (
    <ui.SettingsLayout title={ctx.t("permissionsTitle")} description={ctx.t("permissionsDescription")}>
      <Show when={settings.loading || saving()}>
        <p role="status">{ctx.t(saving() ? "saving" : "permissionsLoading")}</p>
      </Show>
      <Show when={failed() || (!settings.loading && (!client() || !settings()))}>
        <p role="alert" class="text-12-regular text-text-danger-base">
          {ctx.t(failed() ? "permissionsSaveFailed" : "permissionsLoadFailed")}
        </p>
        <ui.Button
          onClick={() => {
            setFailed(false)
            void refetch()
          }}
        >
          {ctx.t("permissionsReload")}
        </ui.Button>
      </Show>
      <Show when={client() && settings()}>
        <ui.SettingsSection
          footer={
            <div class="pt-3">
              <ui.Button
                disabled={saving() || settings.loading}
                onClick={() =>
                  void save(permissionKinds.filter((kind) => !policy(kind)).flatMap((kind) => settingRules(kind)))
                }
              >
                {ctx.t("permissionsReset")}
              </ui.Button>
            </div>
          }
        >
          <For each={permissionKinds.filter((kind) => kind !== "terminal")}>
            {(kind) => (
              <ui.SettingsRow title={ctx.t(`permission_${kind}`)} description={ctx.t(`permission_${kind}_hint`)}>
                <div class="flex min-w-0 flex-col items-start gap-1">
                  <select
                    class="max-w-full cursor-pointer rounded-md border border-border-base bg-surface-raised-base px-2 py-1 text-text-strong"
                    aria-label={ctx.t(`permission_${kind}`)}
                    aria-describedby={mark(kind) ? `permission-${kind}-mark` : undefined}
                    disabled={disabled(kind)}
                    onChange={(event) => {
                      const effect = effects.find((value) => value === event.currentTarget.value)
                      if (effect) void save(settingRules(kind, effect))
                    }}
                  >
                    <Show when={current(kind) === "mixed"}>
                      <option disabled selected>
                        {label("mixed")}
                      </option>
                    </Show>
                    <For each={effects}>
                      {(effect) => (
                        <option value={effect} selected={current(kind) === effect}>
                          {label(effect)}
                        </option>
                      )}
                    </For>
                  </select>
                  <Show when={mark(kind)}>
                    <small id={`permission-${kind}-mark`}>{mark(kind)}</small>
                  </Show>
                </div>
              </ui.SettingsRow>
            )}
          </For>
        </ui.SettingsSection>
        <ui.SettingsSection title={ctx.t("permission_terminal")}>
          <ui.SettingsRow title={ctx.t("permissionTerminalToggle")} description={ctx.t("permission_terminal_hint")}>
            <ui.Switch
              label={ctx.t("permissionTerminalToggle")}
              hideLabel
              description={mark("terminal")}
              disabled={disabled("terminal")}
              checked={current("terminal") === "ask"}
              onChange={(checked) => void save(settingRules("terminal", checked ? "ask" : "deny"))}
            />
          </ui.SettingsRow>
        </ui.SettingsSection>
      </Show>
    </ui.SettingsLayout>
  )
}

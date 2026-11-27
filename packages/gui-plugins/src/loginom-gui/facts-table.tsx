import { usePlugin } from "@opencode/plugin/gui"
import { For, Show } from "solid-js"
import type definition from "./index"
import type { FactRow } from "./package-changes-facts"

export function FactsTable(props: { facts: FactRow[] }) {
  const { t } = usePlugin<typeof definition>()

  return (
    <table
      role="table"
      aria-label={t("facts.title")}
      class="mt-1 w-full table-fixed border-collapse text-left max-[560px]:block"
    >
      <thead class="max-[560px]:sr-only">
        <tr>
          <th scope="col" class="w-1/3 px-2 py-1 font-medium text-text-weak">
            {t("facts.settingOrPort")}
          </th>
          <th scope="col" class="px-2 py-1 font-medium text-text-weak">
            {t("facts.before")}
          </th>
          <th scope="col" class="px-2 py-1 font-medium text-text-weak">
            {t("facts.after")}
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup" class="max-[560px]:block">
        <For each={props.facts}>
          {(fact) => (
            <tr
              role="row"
              class="border-t border-border-weak-base align-top [overflow-wrap:anywhere] max-[560px]:grid max-[560px]:grid-cols-2"
            >
              <th role="rowheader" scope="row" class="px-2 py-1 font-medium text-text-weak max-[560px]:col-span-2">
                {fact.label}
              </th>
              <Show
                when={fact.same}
                fallback={
                  <>
                    <td role="cell" class="px-2 py-1 text-text-diff-delete-base">
                      <span aria-hidden="true" class="hidden text-text-weak max-[560px]:inline">
                        {t("facts.beforeLabel")}{" "}
                      </span>
                      {fact.before ?? "—"}
                    </td>
                    <td role="cell" class="px-2 py-1 text-text-diff-add-base">
                      <span aria-hidden="true" class="hidden text-text-weak max-[560px]:inline">
                        {t("facts.afterLabel")}{" "}
                      </span>
                      {fact.after ?? "—"}
                    </td>
                  </>
                }
              >
                <td role="cell" colspan={2} class="px-2 py-1 max-[560px]:col-span-2">
                  {fact.before} <span class="text-text-weak">{t("facts.same")}</span>
                </td>
              </Show>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

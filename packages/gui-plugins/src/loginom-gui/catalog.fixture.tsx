import { Slot, type Plugin } from "@opencode/plugin/gui"
import type { Entry } from "@opencode/plugin/gui/host"
import { createSignal } from "solid-js"
import { CatalogDetail } from "./catalog-page"
import definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Slot, {
    at: "window.bottom",
    render() {
      const [used, setUsed] = createSignal(false)

      return (
        <>
          <button
            type="button"
            onClick={() =>
              ctx.dialogs.open((dialog) => (
                <CatalogDetail
                  tier="community"
                  kind="skill"
                  author="Community author"
                  copy={{
                    title: "Community skill",
                    description: "Prepares a summary",
                    can: "Suggest an outline",
                    cannot: "Grant permissions",
                    compatibility: "Loginom AI Agent",
                  }}
                  close={dialog.close}
                  use={() => {
                    setUsed(true)
                    dialog.close()
                  }}
                />
              ))
            }
          >
            Open skill details
          </button>
          <output>{used() ? "Conversation started" : "No conversation"}</output>
        </>
      )
    },
  })
}

export const communitySkillPlugin: Entry = {
  ...definition,
  id: "community-skill-test",
  windowEntry: () => Promise.resolve({ default: setup }),
}

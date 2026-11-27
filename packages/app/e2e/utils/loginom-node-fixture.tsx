import type { Context } from "@opencode/plugin/gui"
import { Page } from "@opencode/plugin/gui/builtin"
import type { Entry } from "@opencode/plugin/gui/host"
import { LoginomNodeDraft } from "../../../gui-plugins/src/loginom-gui/node-context"

export const nodeFixture = {
  source: { sessionID: "ses_node_origin", messageID: "msg_node_00" },
  node: {
    package: "Продажи.lgp",
    path: "/Команда/Продажи.lgp",
    guid: "{e9bd5bda-1245-43b0-acbe-d81c405077b1}",
    name: "Расчёт выручки",
  },
}

export const loginomNodeFixture: Entry = {
  id: "loginom-node-fixture",
  windowEntry: async () => ({
    default(ctx: Context) {
      const draft = ctx.use(LoginomNodeDraft)

      const attach = (intent: "ask" | "edit") => {
        const serverID = ctx.servers.list()[0]
        const target = draft()

        if (!serverID || target.status !== "active") return
        target.value.attach({ ...nodeFixture, intent, source: { ...nodeFixture.source, serverID } })
      }

      ctx.add(Page, {
        id: "package",
        title: "Тестовый пакет",
        nav: {},
        render: () => (
          <>
            <button disabled={draft().status !== "active"} onClick={() => attach("ask")}>
              Спросить агента
            </button>
            <button disabled={draft().status !== "active"} onClick={() => attach("edit")}>
              Изменить узел с агентом
            </button>
          </>
        ),
      })
    },
  }),
}

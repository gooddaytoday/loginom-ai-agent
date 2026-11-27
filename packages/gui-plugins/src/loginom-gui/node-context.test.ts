import { expect, test } from "bun:test"
import { encodeNodeContext, nodeSubject, readNodeContext, type NodeContext } from "./node-context"

const context: NodeContext = {
  source: { serverID: "local", sessionID: "ses_origin", messageID: "msg_origin" },
  node: {
    package: "Продажи.lgp",
    path: "/Команда/Продажи.lgp",
    guid: "{e9bd5bda-1245-43b0-acbe-d81c405077b1}",
    name: 'Сумма "К выдаче"\nпо строкам',
  },
  intent: "edit",
}

test("the model sees one compact node reference with escaped names and the selected intent", () => {
  expect(nodeSubject(context)).toBe(
    'Loginom node {"package":"Продажи.lgp","path":"/Команда/Продажи.lgp","guid":"{e9bd5bda-1245-43b0-acbe-d81c405077b1}","name":"Сумма \\"К выдаче\\"\\nпо строкам","intent":"edit"}',
  )
})

test("a saved reference keeps the full conversation identity and rejects an unknown intent", () => {
  const data = encodeNodeContext(context)
  expect(readNodeContext(data)).toEqual(context)
  expect(readNodeContext(data.replace('"edit"', '"run"'))).toBeUndefined()
})

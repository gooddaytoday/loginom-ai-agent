import { Schema } from "effect"
import { SessionV1 } from "@loginom-ai-agent/schema/v1/session"

export const Profile = Schema.Literals(["default", "package-docs", "loginom-automation"])
export type Profile = typeof Profile.Type
export const Info = Schema.Struct({ taskMessageID: SessionV1.MessageID, profile: Profile })
export type Info = typeof Info.Type
export const Request = Schema.Struct({ mode: Schema.Literals(["bind", "request", "apply"]), scope: Info })
export type Request = typeof Request.Type

export function permits(from: Profile, next: Profile) {
  return !(from === "package-docs" && next === "loginom-automation")
}

export * as HostTaskScope from "./task-scope"

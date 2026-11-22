import { Option, Schema } from "effect"

declare const LOGINOM_AI_AGENT_VERSION: string
declare const LOGINOM_AI_AGENT_CHANNEL: string
declare const LOGINOM_AI_AGENT_ARTIFACT: string
declare const LOGINOM_AI_AGENT_RELEASE_HIGHLIGHTS: string

const version = typeof LOGINOM_AI_AGENT_VERSION === "string" ? LOGINOM_AI_AGENT_VERSION : "local"
const channel = typeof LOGINOM_AI_AGENT_CHANNEL === "string" ? LOGINOM_AI_AGENT_CHANNEL : "local"
const artifact = typeof LOGINOM_AI_AGENT_ARTIFACT === "string" ? LOGINOM_AI_AGENT_ARTIFACT : "cli"
// Stable release builds embed the release notes' Highlights; every other build has none.
const highlights =
  typeof LOGINOM_AI_AGENT_RELEASE_HIGHLIGHTS === "string"
    ? Option.getOrElse(
        Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Array(Schema.Struct({ title: Schema.String, body: Schema.String }))),
        )(LOGINOM_AI_AGENT_RELEASE_HIGHLIGHTS),
        () => [],
      )
    : []

export {
  version as LOGINOM_AI_AGENT_VERSION,
  channel as LOGINOM_AI_AGENT_CHANNEL,
  artifact as LOGINOM_AI_AGENT_ARTIFACT,
  highlights as LOGINOM_AI_AGENT_HIGHLIGHTS,
}
export const LOGINOM_AI_AGENT_LOCAL = channel === "local"

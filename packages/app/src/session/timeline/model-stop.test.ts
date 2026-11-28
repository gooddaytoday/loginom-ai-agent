import { describe, expect, test } from "bun:test"
import { stopReason } from "./model-stop"

const invalidRequest = { type: "provider.invalid-request", status: 400 }

describe("model stop context overflow", () => {
  test.each([
    "The prompt is too long",
    "Input is too long for the requested model",
    "Input is too large for the model's configured input limit",
    "Request exceeded this model context window limit",
    "Input exceeds the context window",
    "This request exceeds the model's maximum context length of 128,000 tokens",
    "Input token count (200000) exceeds the maximum",
    "The number of input tokens exceeds maximum length",
    "Tokens in request more than max tokens allowed",
    "Maximum prompt length is 4096",
    "Please reduce the length of the messages",
    "Requested input length 6400 exceeds maximum input length",
    "Maximum context length is 4096 tokens",
    "Input exceeds the maximum allowed input length of 16,384 tokens",
    "Input (7200 tokens) is longer than the model's context length",
    "The token count exceeds the limit of 4096",
    "Input exceeds the available context size",
    "Token count is greater than the context length",
    "`inputs` tokens + `max_new_tokens` must be <= 4096",
    "Context window exceeds limit",
    "Context window exceeded",
    "Request exceeded model token limit",
    "Context length exceeded",
    "Context length is only 8192 tokens",
    "Input length (100000) exceeds the context length",
    "Prompt too long",
    "Prompt exceeds max length",
    "Prompt 超长",
    "Input is too large for model with 4096 maximum context length",
    "Prompt has 18,000 tokens, but the configured context size is 16,000 tokens",
    "model_context_window_exceeded",
    "Range of input length should be [1, 4096]",
    "Too many tokens",
    "Token limit exceeded",
    "request_too_large",
    "400 (no body)",
    "413 status code (no body)",
  ])("shows context guidance for %s", (message) => {
    expect(stopReason({ ...invalidRequest, message })).toBe("session.modelStop.overflow")
  })

  test.each([
    "Throttling error: too many tokens",
    "Service unavailable: too many tokens",
    "Rate limit reached: too many tokens",
    "Too many requests, too many tokens",
    "Too many tokens: max_tokens must be less than 2048",
    "Too many tokens per day, please wait",
    "ThrottlingException: too many tokens",
    "Payload too large",
  ])("keeps the regular invalid-request guidance for %s", (message) => {
    expect(stopReason({ ...invalidRequest, message })).toBe("session.modelStop.invalid")
  })

  test("reads overflow wording from the provider response body", () => {
    expect(
      stopReason({
        ...invalidRequest,
        message: "Request rejected",
        response: { body: '{"error":{"message":"Please reduce the length of the messages"}}' },
      }),
    ).toBe("session.modelStop.overflow")
  })

  test("uses the provider's explicit context-length code", () => {
    expect(
      stopReason({
        ...invalidRequest,
        message: "Request rejected",
        response: { body: '{"error":{"code":"context_length_exceeded"}}' },
      }),
    ).toBe("session.modelStop.overflow")
  })

  test.each([429, 503])("ignores overflow wording on HTTP %s", (status) => {
    expect(stopReason({ ...invalidRequest, status, message: "The prompt is too long" })).toBe(
      "session.modelStop.invalid",
    )
  })
})

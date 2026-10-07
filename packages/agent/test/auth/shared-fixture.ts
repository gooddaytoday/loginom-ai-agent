// Fake JWT payloads only; no signing or real credentials are used.
export function fakeAuth(refresh = "fake-refresh", expires = 0, userId = "fake-user", accountId = "fake-account") {
  return {
    type: "oauth" as const,
    access: `fake.${Buffer.from(
      JSON.stringify({
        sub: userId,
        "https://api.openai.com/auth": { chatgpt_user_id: userId, chatgpt_account_id: accountId },
        refresh,
      }),
    ).toString("base64url")}.signature`,
    refresh,
    expires,
    accountId,
  }
}

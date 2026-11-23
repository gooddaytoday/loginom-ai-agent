import { expect, test } from "bun:test"
import { setupCandidate } from "../../src/cli/loginom-management"
import type { Loginom } from "@opencode-ai/schema/loginom"

const current: Loginom.View = {
  revision: 4,
  generation: 2,
  url: "http://example.test/app/",
  username: "user",
  folder: "/user",
  hasPassword: true,
  state: "ready",
}

test("stdin setup distinguishes missing secrets, explicit empty password and replacements", () => {
  expect(setupCandidate("{}", current)).toEqual({
    revision: 4,
    url: "http://example.test/app/",
    username: "user",
    password: { operation: "preserve" },
  })
  expect(setupCandidate('{"password":""}', current).password).toEqual({ operation: "empty" })
  expect(setupCandidate('{"password":"new-password"}', current).password).toEqual({
    operation: "replace",
    value: "new-password",
  })
  // Older setup scripts may still send a key; the built-in knowledge key replaced it.
  for (const json of ['{"apiKey":"old-key"}', '{"apiKey":""}'])
    expect(setupCandidate(json, current)).not.toHaveProperty("apiKey")
  expect(() => setupCandidate('{"password":null}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate('{"folder":"/not-a-setup-field"}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate("secret-broken-json", current)).toThrow("CLI_SETUP_INVALID")
})

test("setup finishes resource verification before minting its validation token", async () => {
  const source = new URL("../../src/cli/loginom-management.ts", import.meta.url).href
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import { loginomManagement } from ${JSON.stringify(source)};
    const calls=[];
    const current=${JSON.stringify(current)};
    const host={async request(method,input){
      calls.push(method);
      if(method==='connection.status'||method==='connection.save')return current;
      if(method==='connection.verify-resources')return {verified:true};
      if(method==='connection.check')return {validationId:'fresh',expiresAt:Date.now()+300000};
      throw Error('UNEXPECTED_METHOD');
    }};
    await loginomManagement(host,'setup',{stdinJSON:true,acknowledge:false});
    process.stdout.write(JSON.stringify(calls));
  `,
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  )
  child.stdin.write('{"password":""}')
  child.stdin.end()
  const [exit, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect({ exit, errors }).toEqual({ exit: 0, errors: "" })
  expect(JSON.parse(output)).toEqual([
    "connection.status",
    "connection.verify-resources",
    "connection.check",
    "connection.save",
  ])
})

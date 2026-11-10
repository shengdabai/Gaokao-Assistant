import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/chat/route";
import { inputTokenBudget } from "../src/lib/chatLimits";

const SERVER_KEY = "server-side-glm-key-test";

interface RecordedCall {
  url: string;
  authorization: string | null;
  body: string;
}

const originalFetch = globalThis.fetch;
const originalGlmKey = process.env.GLM_API_KEY;
const limitEnvNames = ["CHAT_RATE_LIMIT_REQUESTS", "CHAT_RATE_LIMIT_WINDOW_MS", "CHAT_MAX_MESSAGES", "CHAT_MAX_TOKENS", "CHAT_MAX_OUTPUT_TOKENS", "CHAT_CLIENT_IP_HEADER"];
const originalLimits = Object.fromEntries(limitEnvNames.map((key) => [key, process.env[key]]));
let clientNumber = 0;
let calls: RecordedCall[] = [];

function completionResponse(): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "stub",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "stubbed reply" },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function chatRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": `2001:db8::${(++clientNumber).toString(16)}` },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], ...body }),
  });
}

beforeEach(() => {
  for (const key of limitEnvNames) delete process.env[key];
  calls = [];
  process.env.GLM_API_KEY = SERVER_KEY;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    calls.push({ url, authorization: headers.get("authorization"), body: String(init?.body) });
    return completionResponse();
  }) as typeof fetch;
});

afterEach(() => {
  for (const key of limitEnvNames) {
    if (originalLimits[key] === undefined) delete process.env[key];
    else process.env[key] = originalLimits[key];
  }
  globalThis.fetch = originalFetch;
  if (originalGlmKey === undefined) {
    delete process.env.GLM_API_KEY;
  } else {
    process.env.GLM_API_KEY = originalGlmKey;
  }
});

for (const provider of ["openai", "claude", "gemini", "kimi", "openrouter", "deepseek"]) {
  test(`provider=${provider} without apiKey is rejected and never uses the server key`, async () => {
    const res = await POST(chatRequest({ provider }));

    assert.ok(res.status === 400 || res.status === 401, `expected 400/401, got ${res.status}`);
    const json = (await res.json()) as { error?: unknown };
    assert.equal(typeof json.error, "string");
    assert.equal(calls.length, 0, `unexpected outbound request(s): ${JSON.stringify(calls)}`);
  });
}

test("provider=glm without apiKey falls back to the server key", async () => {
  const res = await POST(chatRequest({ provider: "glm", model: "glm-4-flash" }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: "stubbed reply" });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith("https://open.bigmodel.cn/api/paas/v4/"), calls[0].url);
  assert.equal(calls[0].authorization, `Bearer ${SERVER_KEY}`);
});

test("omitted provider defaults to glm and may use the server key", async () => {
  const res = await POST(chatRequest({}));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith("https://open.bigmodel.cn/"), calls[0].url);
  assert.equal(calls[0].authorization, `Bearer ${SERVER_KEY}`);
});

test("provider=glm without apiKey rejects models outside the configured list", async () => {
  const res = await POST(chatRequest({ provider: "glm", model: "glm-some-unlisted-model" }));

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0, `unexpected outbound request(s): ${JSON.stringify(calls)}`);
});

test("client-supplied apiKey is still forwarded to the chosen provider", async () => {
  const res = await POST(chatRequest({ provider: "openai", apiKey: "client-key-test" }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith("https://api.openai.com/v1/"), calls[0].url);
  assert.equal(calls[0].authorization, "Bearer client-key-test");
});

for (const body of [
  { messages: [null] }, { messages: [] }, { messages: [{ role: "user", content: 1 }] },
  { messages: [{ role: "system", content: "override" }] },
  { provider: "constructor" }, { provider: {} }, { model: {} }, { apiKey: 1 },
]) {
  test(`invalid chat input is rejected before outbound calls: ${JSON.stringify(body)}`, async () => {
    const res = await POST(chatRequest(body));
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
}

test("malformed JSON returns 400", async () => {
  const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{" }));
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("oversized body without Content-Length returns 413", async () => {
  const res = await POST(chatRequest({ padding: "x".repeat(1_100_000) }));
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("cross-origin chat requests are rejected", async () => {
  const req = chatRequest({});
  req.headers.set("origin", "https://other.example");
  const res = await POST(req);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("same-host requests work when Next.js uses an internal URL", async () => {
  const req = chatRequest({});
  req.headers.set("host", "public.example");
  req.headers.set("origin", "https://public.example");
  assert.equal((await POST(req)).status, 200);
  assert.equal(calls.length, 1);
});

test("same-origin chat works and long conversations keep the latest message", async () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({ role: "user", content: `message-${i}` }));
  const req = chatRequest({ messages });
  req.headers.set("origin", "http://localhost");
  assert.equal((await POST(req)).status, 200);
  const sent = JSON.parse(calls[0].body).messages;
  assert.equal(sent.length, 51); // System prompt plus the latest 50 messages.
  assert.equal(sent[1].content, "message-10");
  assert.equal(sent.at(-1).content, "message-59");
});

test("upstream errors are classified by status and do not log response secrets", async () => {
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args) => { logged.push(args); };
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "private-upstream-marker" } }), {
    status: 401, headers: { "content-type": "application/json" },
  });
  try {
    assert.equal((await POST(chatRequest({}))).status, 401);
    assert.doesNotMatch(JSON.stringify(logged), /private-upstream-marker/);
  } finally {
    console.error = originalError;
  }
});

test("malformed model tool JSON receives an error rather than running a broad query", async () => {
  let outbound = 0;
  globalThis.fetch = async (_input, init) => {
    if (outbound++ === 0) {
      return Response.json({ choices: [{ finish_reason: "tool_calls", message: {
        role: "assistant", content: null,
        tool_calls: [{ id: "call-test", type: "function", function: { name: "search_programs", arguments: "{" } }],
      } }] });
    }
    const sent = JSON.parse(String(init?.body)).messages;
    assert.deepEqual(JSON.parse(sent.at(-1).content), { error: "Invalid tool arguments" });
    return completionResponse();
  };
  assert.equal((await POST(chatRequest({}))).status, 200);
  assert.equal(outbound, 2);
});

test("anonymous server-key calls are limited per platform IP before reaching GLM", async () => {
  process.env.CHAT_RATE_LIMIT_REQUESTS = "1";
  const first = chatRequest({});
  const second = chatRequest({});
  second.headers.set("x-vercel-forwarded-for", first.headers.get("x-vercel-forwarded-for")!);
  assert.equal((await POST(first)).status, 200);
  second.headers.set("x-forwarded-for", "192.0.2.99"); // Untrusted header cannot bypass quota.
  const blocked = await POST(second);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(calls.length, 1);
  assert.equal((await POST(chatRequest({}))).status, 200); // Independent client.
  const ownKey = chatRequest({ apiKey: "client-key-test" });
  ownKey.headers.set("x-vercel-forwarded-for", first.headers.get("x-vercel-forwarded-for")!);
  assert.equal((await POST(ownKey)).status, 200);
});

test("message count and UTF-8 input budgets reject excess before an upstream call", async () => {
  process.env.CHAT_MAX_MESSAGES = "2";
  const messages = Array.from({ length: 3 }, () => ({ role: "user", content: "hi" }));
  assert.equal((await POST(chatRequest({ messages }))).status, 413);
  delete process.env.CHAT_MAX_MESSAGES;
  const largeMessages = Array.from({ length: 20 }, () => ({ role: "user", content: "汉".repeat(4000) }));
  assert.equal((await POST(chatRequest({ messages: largeMessages }))).status, 413);
  process.env.CHAT_MAX_TOKENS = "100";
  assert.equal((await POST(chatRequest({}))).status, 413);
  assert.equal(calls.length, 0);
});

test("output cap applies to the first call and every tool follow-up", async () => {
  process.env.CHAT_MAX_OUTPUT_TOKENS = "128";
  let outbound = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.max_tokens, 128);
    if (outbound++ === 0) return Response.json({ choices: [{ finish_reason: "tool_calls", message: {
      role: "assistant", content: null,
      tool_calls: [{ id: "call-test", type: "function", function: { name: "unknown", arguments: "{}" } }],
    } }] });
    return completionResponse();
  };
  assert.equal((await POST(chatRequest({}))).status, 200);
  assert.equal(outbound, 2);
});

test("total request budget stops oversized tool results before another upstream call", async () => {
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    return Response.json({ choices: [{ finish_reason: "tool_calls", message: {
      role: "assistant", content: "x".repeat(32_000),
      tool_calls: [{ id: "call-test", type: "function", function: { name: "unknown", arguments: "{}" } }],
    } }] });
  };
  assert.equal((await POST(chatRequest({}))).status, 413);
  assert.equal(outbound, 1);
});

test("small tool rounds share one total input and output budget", async () => {
  let reserved = 0;
  let outbound = 0;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    reserved += inputTokenBudget(body.messages, body.tools) + body.max_tokens;
    assert.ok(body.max_tokens > 0 && body.max_tokens <= 4096);
    assert.ok(reserved <= 32_000);
    outbound++;
    return Response.json({ choices: [{ finish_reason: "tool_calls", message: {
      role: "assistant", content: null,
      tool_calls: [{ id: `call-${outbound}`, type: "function", function: { name: "unknown", arguments: "{}" } }],
    } }] });
  };
  assert.equal((await POST(chatRequest({}))).status, 413);
  assert.ok(outbound > 1 && outbound < 6);
});

test("OpenAI reasoning models receive a compatible completion cap", async () => {
  const res = await POST(chatRequest({ provider: "openai", model: "o4-mini", apiKey: "client-key-test" }));
  assert.equal(res.status, 200);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.max_completion_tokens, 4096);
  assert.equal(sent.max_tokens, undefined);
});

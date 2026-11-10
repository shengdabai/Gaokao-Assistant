import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/chat/route";

const SERVER_KEY = "server-side-glm-key-test";

interface RecordedCall {
  url: string;
  authorization: string | null;
  body: string;
}

const originalFetch = globalThis.fetch;
const originalGlmKey = process.env.GLM_API_KEY;
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], ...body }),
  });
}

beforeEach(() => {
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

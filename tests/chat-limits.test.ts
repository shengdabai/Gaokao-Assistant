import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, getChatLimits, inputTokenBudget, SlidingWindowLimiter } from "../src/lib/chatLimits";

test("sliding window expires individual requests at the exact boundary", () => {
  const limiter = new SlidingWindowLimiter();
  assert.equal(limiter.consume("a", 2, 1000, 0), 0);
  assert.equal(limiter.consume("a", 2, 1000, 500), 0);
  assert.equal(limiter.consume("a", 2, 1000, 999), 1);
  assert.equal(limiter.consume("b", 2, 1000, 999), 0);
  assert.equal(limiter.consume("a", 2, 1000, 1000), 0);
  assert.equal(limiter.consume("a", 2, 1000, 1001), 1);
  assert.equal(limiter.consume("a", 2, 1000, 1500), 0);
});

test("full limiter fails closed without evicting active quotas, and reclaims expired clients", () => {
  const limiter = new SlidingWindowLimiter(1);
  assert.equal(limiter.consume("a", 1, 1000, 0), 0);
  assert.equal(limiter.consume("b", 1, 1000, 500), 1);
  assert.equal(limiter.consume("a", 1, 1000, 500), 1);
  assert.equal(limiter.consume("b", 1, 1000, 1000), 0);
});

test("platform IP is canonicalized; invalid/missing headers share a bucket", () => {
  const original = process.env.CHAT_CLIENT_IP_HEADER;
  try {
    delete process.env.CHAT_CLIENT_IP_HEADER;
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "192.0.2.1" })), "unknown");
    assert.equal(clientIp(new Headers({ "x-vercel-forwarded-for": "junk" })), "unknown");
    assert.equal(clientIp(new Headers({ "x-vercel-forwarded-for": "fe80::1%eth0" })), "unknown");
    assert.equal(clientIp(new Headers({ "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2" })), "unknown");
    assert.equal(clientIp(new Headers({ "x-vercel-forwarded-for": "2001:0db8:0:0:0:0:0:1" })),
      clientIp(new Headers({ "x-vercel-forwarded-for": "2001:db8::1" })));
    process.env.CHAT_CLIENT_IP_HEADER = "x-real-ip";
    assert.equal(clientIp(new Headers({ "x-real-ip": "192.0.2.1" })), "192.0.2.1");
  } finally {
    if (original === undefined) delete process.env.CHAT_CLIENT_IP_HEADER;
    else process.env.CHAT_CLIENT_IP_HEADER = original;
  }
});

test("invalid numeric configuration cannot disable a limit", () => {
  const keys = ["CHAT_RATE_LIMIT_REQUESTS", "CHAT_RATE_LIMIT_WINDOW_MS", "CHAT_MAX_MESSAGES", "CHAT_MAX_TOKENS", "CHAT_MAX_OUTPUT_TOKENS"];
  const original = keys.map((key) => process.env[key]);
  try {
    for (const value of ["0", "-1", "NaN", "Infinity", "1.5", "99999999999999999999", ""]) {
      for (const key of keys) process.env[key] = value;
      assert.deepEqual(getChatLimits(), { requests: 10, windowMs: 60_000, maxMessages: 100, maxTokens: 32_000, maxOutputTokens: 4096 });
    }
    keys.forEach((key) => { process.env[key] = "25"; });
    assert.deepEqual(getChatLimits(), { requests: 25, windowMs: 25, maxMessages: 25, maxTokens: 25, maxOutputTokens: 25 });
  } finally {
    keys.forEach((key, i) => {
      if (original[i] === undefined) delete process.env[key];
      else process.env[key] = original[i];
    });
  }
});

test("input accounting includes UTF-8 bytes, tool schemas and tool results", () => {
  assert.ok(inputTokenBudget([{ content: "汉" }], []) > inputTokenBudget([{ content: "a" }], []));
  assert.ok(inputTokenBudget([], [{ name: "tool" }]) > inputTokenBudget([], []));
  assert.ok(inputTokenBudget([{ role: "tool", content: "result" }], []) > inputTokenBudget([], []));
});

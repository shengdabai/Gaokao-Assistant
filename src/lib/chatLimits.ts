import { isIP } from "node:net";

function positiveInteger(value: string | undefined, fallback: number, ceiling: number): number {
  const parsed = Number(value);
  return value && /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0 && parsed <= ceiling
    ? parsed : fallback;
}

export function getChatLimits() {
  return {
    requests: positiveInteger(process.env.CHAT_RATE_LIMIT_REQUESTS, 10, 1000),
    windowMs: positiveInteger(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 60_000, 86_400_000),
    maxMessages: positiveInteger(process.env.CHAT_MAX_MESSAGES, 100, 1000),
    maxTokens: positiveInteger(process.env.CHAT_MAX_TOKENS, 32_000, 1_000_000),
    maxOutputTokens: positiveInteger(process.env.CHAT_MAX_OUTPUT_TOKENS, 4096, 8192),
  };
}

export function clientIp(headers: Headers): string {
  // Only trust a header the hosting platform overwrites, never a client-selected
  // forwarding chain. Missing/invalid headers share one bucket (fail closed).
  const header = process.env.CHAT_CLIENT_IP_HEADER || "x-vercel-forwarded-for";
  const value = headers.get(header)?.trim() || "";
  if (isIP(value) === 4) return value;
  if (isIP(value) === 6 && !value.includes("%")) return new URL(`http://[${value}]/`).hostname;
  return "unknown";
}

// Per process/instance only: restarts reset quotas; replicas do not share them.
export class SlidingWindowLimiter {
  private readonly clients = new Map<string, number[]>();

  constructor(private readonly maxClients = 10_000) {}

  consume(key: string, limit: number, windowMs: number, now = Date.now()): number {
    const active = (this.clients.get(key) || []).filter((time) => time > now - windowMs);
    if (active.length >= limit) return Math.max(1, Math.ceil((active[0] + windowMs - now) / 1000));
    if (!this.clients.has(key) && this.clients.size >= this.maxClients) {
      for (const [client, times] of this.clients) {
        if (times.at(-1)! <= now - windowMs) this.clients.delete(client);
      }
      // Do not evict active clients: cycling IPs must not reset existing quotas.
      if (this.clients.size >= this.maxClients) return Math.ceil(windowMs / 1000);
    }
    active.push(now);
    this.clients.set(key, active);
    return 0;
  }
}

export const anonymousChatLimiter = new SlidingWindowLimiter();

// Conservative model-independent accounting: one UTF-8 byte per token plus
// framing allowance. Reserve both inputs and maximum outputs for EVERY call,
// including tool follow-ups, without relying on provider usage reporting.
export function inputTokenBudget(messages: unknown[], tools: unknown[]): number {
  return Buffer.byteLength(JSON.stringify({ messages, tools }), "utf8") + 256 + messages.length * 16;
}

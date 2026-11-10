# Security Policy

Please do not report vulnerabilities, exposed secrets, credentials, or private user data in public issues.

Use GitHub private vulnerability reporting when it is available for this repository. If it is not available, contact the repository owner through the profile contact channel.

If a secret is exposed, revoke or rotate it first, then remove it from Git history and close the related GitHub secret scanning alert only after verification.

## Anonymous chat quota controls

GLM chat intentionally permits anonymous use of the server key. The limits below
are server environment settings; invalid, zero, negative or excessive numeric
values fall back to defaults. Do not expose the server key to browser code.

| Setting | Default | Maximum | Scope |
| --- | --- | --- | --- |
| `CHAT_RATE_LIMIT_REQUESTS` | 10 | 1000 | Server-key requests per client per window |
| `CHAT_RATE_LIMIT_WINDOW_MS` | 60000 | 86400000 | Sliding window in milliseconds |
| `CHAT_MAX_MESSAGES` | 100 | 1000 | Submitted messages (latest 50 retained) |
| `CHAT_MAX_TOKENS` | 32000 | 1000000 | Total input/output reservation across all upstream calls |
| `CHAT_MAX_OUTPUT_TOKENS` | 4096 | 8192 | Output cap for each upstream call |
| `CHAT_CLIENT_IP_HEADER` | `x-vercel-forwarded-for` | N/A | Single IP header overwritten by the hosting platform |

The limiter is in memory, **per process/instance**. Restarts reset it; replicas do
not share quotas. It tracks at most 10000 clients and rejects new clients when
full until entries expire. Rate rejection returns HTTP 429 with `Retry-After`.
Client-supplied provider keys do not consume the anonymous server-key quota.
Message/token limits apply to both paths; excess returns HTTP 413.

Only configure an IP header that the trusted platform/proxy overwrites and strips
from incoming client requests. Never trust an arbitrary `X-Forwarded-For` chain
or expose an origin that bypasses that proxy. Missing, invalid or multi-IP values
share one fallback bucket, so an unconfigured host remains limited. For multiple
instances or stronger cost protection, add shared rate limiting and provider-side
spending limits before opening substantial public traffic.

Token accounting conservatively uses UTF-8 bytes plus framing allowance rather
than a provider-specific tokenizer. Each call reserves its output cap (reduced
when the remaining budget is smaller), even if the provider returns less.
System prompts, tool definitions and tool follow-ups
count toward the budget. This may reject a long conversation earlier than its
provider token count would; existing per-message truncation still applies.

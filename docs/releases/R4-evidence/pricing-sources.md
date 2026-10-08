# R4 official pricing verification

Verified on **2026-10-08** using the OpenAI Docs skill. The official pages below were fetched and their pricing and snapshot sections inspected; this was documentation access only. No paid provider calls were made.

| Standard text model identifiers                    | Input USD / million tokens | Output USD / million tokens | Official source                                                          |
| -------------------------------------------------- | -------------------------: | --------------------------: | ------------------------------------------------------------------------ |
| `gpt-4o-mini`, `gpt-4o-mini-2024-07-18`            |                       0.15 |                        0.60 | [GPT-4o Mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) |
| `gpt-4o`, `gpt-4o-2024-08-06`, `gpt-4o-2024-11-20` |                       2.50 |                       10.00 | [GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o)           |
| `gpt-4-turbo`, `gpt-4-turbo-2024-04-09`            |                      10.00 |                       30.00 | [GPT-4 Turbo](https://developers.openai.com/api/docs/models/gpt-4-turbo) |

The calculation version is `openai-standard-text-2026-10-08-v1`. Tariff estimates use the actual response model identifier. Pricing is an explicit allowlist; identifier prefixes and future snapshots are not assumed to have known prices. `gpt-4o-2024-05-13` is intentionally omitted because the current generic model page does not establish its historical distinct tariff. Unknown configured identifiers fail admission; unexpected returned identifiers retain any received usage with a null estimate and then fail safely.

Received prompt/completion counts are retained separately from the estimate. Missing or partial usage yields nullable counts and a null estimated cost. The estimate charges the standard input tariff without assuming cached-input discounts, so it must not be presented as the final provider invoice. Reservations cover every permitted attempt at the configured maximum input and output limits and round upward to integer USD micros.

[OpenAI rate-limit guidance](https://developers.openai.com/api/docs/guides/rate-limits) was fetched to confirm bounded attempt counts, elapsed-time limits, backoff with jitter, `Retry-After` handling and disabling nested SDK retries. Installed OpenAI SDK source `packages/ai/node_modules/openai/src/client.ts` was inspected: version 6.34.0 defaults to two retries. R4 explicitly sets `maxRetries: 0` both on the client and request; deterministic unit transport tests verify one actual call per provider attempt. SDK logging is disabled to prevent request/response body logging.

The connection deadline bounds DNS, connect, TLS and time to response headers. The request deadline also bounds response-body consumption; abort ends the local wait even when a mock transport ignores the signal. Aborting does not establish that provider execution or billing stopped. Transport timeouts, HTTP 408, cancellation during a request and network errors therefore remain uncertain and do not trigger automatic provider retries.

Machine-readable prices, source identifiers and caveats are recorded in [pricing-sources.json](pricing-sources.json).

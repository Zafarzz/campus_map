# ADR-0012: WebSocket topics over a broker, with an in-process fallback

- **Status:** accepted
- **Date:** 2026-10-19
- **Phase:** 2 (Layer 0)

## Context

`MASTER_PROMPT.md` §8 sets the real-time contract: authenticate with a
short-lived JWT **before accepting** the connection, a JSON envelope with a
`type` field, "a per-instance connection manager and Redis pub/sub to fan
messages out across workers", heartbeats, reconnection with `last_event_id`,
message-size and rate limits, and "a REST polling fallback for every stream".
§10.5 adds: prove fan-out works with two app workers behind Redis.

## Decision

**Three layers: a connection manager per worker (`hub`), a publish/subscribe
abstraction (`broker`) with Redis and in-process implementations, and a closed
envelope/topic vocabulary (`events`).**

A publish goes `hub → broker → every hub`. The hub knows about sockets; the
broker knows about workers. Neither knows about the other's concern, which is
what makes a client on worker B able to receive an event published by worker A —
something a connection manager alone can never do, because it only sees its own
process.

### Topics are parsed, not accepted as strings

A topic (`room:bld-h-f1-a101`, `building:bld-h`, `alerts`) becomes part of a
Redis channel name. An unvalidated one would let a client subscribe to arbitrary
channels on shared Redis — including another application's keyspace
notifications. `Topic.parse` restricts ids to `[A-Za-z0-9._-]` and rejects
everything else, rather than escaping it.

### Topic widening lives in the hub

`state_changed` is published to `room:{id}`, but a client watching
`building:bld-h` expects it too. Widening happens once, in
`Hub.publish_state_changed`, rather than at each call site — a publisher that
forgot the building topic would leave building-level subscribers quietly stale,
which is the kind of bug nobody notices until a demo.

### The token travels in the query string

The browser WebSocket API cannot set headers, so there is no way to send a
bearer token on the handshake. It goes in the query string, is verified
**before** `accept()`, and the tokens are short-lived and carry only a
pseudonymous subject (`user.id`, never a name or email). The cost is that query
strings reach access logs; that is the available trade, not the ideal one, and
it is why the token lifetime is minutes rather than hours.

## Why an in-process fallback rather than requiring Redis

§5 asks for "Redis (with an in-process fallback for local development)", and
requiring a broker to run the local stack would make the development experience
worse for no gain on a single worker.

**The fallback is honest about its limit.** `InProcessBroker.supports_fan_out`
returns `False`, it logs a warning once at startup naming the missing
`REDIS_URL`, and the value is reported to every client in the `welcome` frame as
`cross_worker_fan_out`. Behaving like a working broker while silently reaching
only one worker is how a staging deployment ends up with half its clients
missing events — the failure would be invisible until someone noticed stale
rooms on one browser and not another.

## Backpressure: drop the oldest, count the loss

Each subscription owns a bounded queue (256 messages). A full queue discards its
**oldest** entry, not the newest, and increments a `dropped` counter.

Two deliberate choices. First, the publisher never blocks: a slow client must
not stall the worker for everyone else. Second, for a *state* stream the latest
value is the one that matters — dropping the newest would leave a slow client
permanently stale, whereas dropping the oldest leaves it with a detectable gap
and the current truth.

## Alternatives rejected

- **Server-sent events instead of WebSockets.** Simpler and auto-reconnecting,
  but one-directional: a client could not subscribe or unsubscribe, so every
  client would receive every event. Kept as a possible future transport — the
  hub takes a `send` callable, not a `WebSocket`, so a second transport needs no
  change in the hub.
- **PostgreSQL `LISTEN`/`NOTIFY` as the broker.** Tempting, since PostgreSQL is
  already a hard dependency and Redis is not. Rejected because `NOTIFY` holds a
  connection per listener and its payload is capped at 8 kB, and because tying
  fan-out to the database couples real-time delivery to the transaction that
  happens to be open. Worth revisiting if Redis proves unwelcome in deployment.
- **Polling only, no WebSocket.** The REST fallback exists and is a first-class
  endpoint (`GET /api/v1/stream/changes`), but polling alone cannot meet the
  liveness the map wants without a poll interval short enough to cost more than
  the socket.

## Verification

Redis 8.1.0 checked against PyPI on 2026-10-19 and pinned.

`tests/test_realtime.py::TestHub::test_two_hubs_sharing_a_broker_both_receive_a_publish`
is the multi-worker proof in a form the suite can run: two independent `Hub`
objects over one broker, which is exactly the topology the split exists to
support. A genuine two-process run against Redis is recorded in
`docs/runbooks/performance.md`.

Hostile topic ids are covered by
`test_a_topic_id_cannot_smuggle_channel_syntax`; backpressure by
`TestBackpressure`.

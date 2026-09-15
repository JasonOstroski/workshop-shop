---
description: ">"
---


# Bluebox OTel Instrumentation

You already know OpenTelemetry — this skill does not teach it. It carries the Bluebox
contract and the discipline rules that turn wiring into verified, working coverage.

## Inventory, plan, one question — then work

Levels, used throughout: **1** traces; **2** traces + metrics; **3** traces + metrics +
logs, with the existing logger bridged.

Your first response is the plan the developer approves, not a summary of intent:

1. **Inventory.** Every service in `src/` (or the equivalent) with its language. Out of
   scope, each with a one-line reason: browser apps and browser-driving load tools
   (anything whose work runs inside child browser processes, e.g. playwright/puppeteer-based
   load generators — server-side OTel cannot see their work, do not chase it);
   off-the-shelf images this repo builds no code for (postgres, rabbitmq, nginx — a
   collector concern); when the repo has a compose/Helm stack, services it never deploys
   (e.g. a Kubernetes operator) — with no such stack, every buildable service is in scope;
   and services whose image is known from its base image to be unbuildable on this host —
   say why. Only what the base image tells you up front is a skip; the same blocker met
   while building is `blocked` (Hard rule 11), not a skip.
2. **Plan, per in-scope service** — one table row (a table even for a single service):
   language; recipe (zero-code agent, or
   SDK when no agent exists for the runtime); the files that will change — the Dockerfile or
   start command, the deployment entry, for SDK recipes the bootstrap file, and for level 3
   the logging configuration (appender/transport). Derive these from the Dockerfile and
   the compose/Helm entry, naming bootstrap and logging files by convention; do not read
   service source at this step. Under the table, a per-runtime legend of what each level
   yields, then one line, "Expected: about L–H min for N services; first telemetry shows at
   the end, verification is batched", computed from the plan and never quoted as a constant:
   11.5 min for the run itself (inventory, the question, compose, one request per service,
   the settle, the ask) plus, per in-scope service, .NET 0.9 min, Java 1.2, Go 2.7, Node 2.8,
   any other runtime 1.5 (the benchmark's calibration, `evaluations/instrumentation-benchmark/
   docs/ledger.md`); at level 1 or 2 take 0.7 of the per-service part; L and H are 0.8 and
   1.2 of the sum, rounded to whole minutes. Shared files get their own line: compose/Helm and run instructions are edited;
   `.env.otel.bluebox-template` is read, never edited; `.gitignore` gains `.bluebox/`, and
   `.bluebox/instrumentation-run.json` records each service as it finishes, so an
   interrupted run resumes (below).
   The table plus the shared-files line is the allowlist the developer approves; nothing
   outside it changes during the run.
   If wiring turns out to need a file the plan did not name, ask again before touching it —
   the same way as the question below, naming the file and why. Unattended, do not touch
   it: name it in your progress line (Hard rule 9), mark the service `blocked` in the
   report, and continue with the rest of the plan.
3. **One question.** Ask scope and depth together — options for the level (recommend 3 — the
   developer is present to consent; level 1 is the fast path) and for scope (default: all
   in-scope server-side services; .NET and Java are the priority runtimes). Where the agent
   has a question tool (`AskUserQuestion` in Claude Code), ask through it: the call blocks
   until the developer answers. Without such a tool, ask in plain text and **stop and wait
   for the answer**. That pause is the consent gate; instrumenting or exporting logs or
   metrics without it is not acceptable, and a dismissed or cancelled question is not an
   answer — stop and say what you would have done. Skip the question only when the user
   already chose, explicitly said not to ask, or no interactive user exists (a headless run).
   Unattended, the level is the one the request names (level 1, 2 or 3); a request that names
   none but asks for logs means level 3; otherwise the default is **level 2** — traces and
   metrics, no log export: nobody in the session consented to application logs leaving the
   environment, and logs are where secrets and personal data live. Either way print the plan
   table, then one line in the form "Taking level N: <why>", and continue.

**Order is fixed: inventory text, plan table, the question, then the first file change.** The
printed table is the record of what was exported; "I'll print the plan next" is not a plan,
and a file created or edited before the table — or before the question was answered or
skipped for one of the reasons above — is a violation. Do not read service source before the
question either.

## Hard rules

1. **Never handle the ingest token, and never make a tool print it back.** Do not fetch,
   print, or write it anywhere. The app reads it from an env var or secret; the user supplies
   the value (Bluebox Setup page). Validating configuration counts as printing: `docker
   compose config`, `env`, `printenv`, and `cat` on a file that carries the token all put it
   in your output, where it is recorded. Validate with `docker compose config --quiet` (or
   `helm template` on values that hold no token); when you need to read such output, filter
   the header and token lines out of it first. If a value does reach your output, say so and
   tell the user to rotate it.
2. **Config is external.** All transport via standard `OTEL_*` env vars — endpoint, headers,
   protocol, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`. Never hardcode endpoints,
   tokens, or service names in code. Never commit secrets; confirm env files holding real
   values are git-ignored.
3. **Zero-code first.** Prefer the language's auto-instrumentation (Java agent, .NET
   auto-instr, `node --require` + auto-instrumentations, `opentelemetry-instrument`) and
   add code only where the runtime needs it (Go, C++, bespoke frameworks).
4. **Logs are additive.** Export logs by bridging the logger the service already uses
   (appender/hook/transport). Sink, format, timestamps, timezone, and levels stay
   byte-identical. If export would change existing behavior, drop logs for that service
   (level 2) and say so. Before bridging, read what the service logs — its log statements
   and the fields they carry: request or response bodies, credentials, tokens, or personal
   data (names, emails, account identifiers) in the records mean that service stays at
   level 2, and so does a service whose records you cannot read (a wrapper logger, dynamic
   fields). This holds even when the developer chose level 3 at the question: name the
   service and the reason in the report, and interactive, ask before bridging it — the same
   way as the question — so the developer can raise it knowingly. Check two known traps while
   wiring, not at verification:
   .NET `ClearProviders()` discards the provider the auto-instrumentation injects - remove
   only the providers you replace instead; winston (v3+) exports nothing until
   `@opentelemetry/winston-transport` is installed - the winston instrumentation then
   injects the transport itself into loggers created after it loads (`--require` order),
   so do not also attach `OpenTelemetryTransportV3` by hand or every record duplicates.
5. **Identity attributes.** `vcs.repository.url.full` + `vcs.ref.head.revision` from
   build-time values (build-arg -> env; drop the pair when values are empty — never emit
   empties), `deployment.environment.name`, plus cloud resource attributes where a
   detector exists. This is what maps telemetry back to code and environment.
6. **Self-disabling.** With no `OTEL_EXPORTER_OTLP_ENDPOINT` set, every service must behave
   exactly as before instrumentation.
7. **Protocol is `http/protobuf`** (`OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`) — Dynatrace
   rejects other OTLP transports — and **metrics use delta temporality**
   (`OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`).
8. **Build-verify every touched service** (compile/test with its normal command) before
   claiming it is wired. Fix what you broke.
9. **Narrate progress.** One line at each step boundary: inventory done, per-service wired,
   builds green, app started, verification started/result. Dead air reads as a hang.
10. **Finish in one session.** Never end your turn while builds, traffic, or verification
    are pending — poll to completion, verify, then report. In a non-interactive session,
    ending early IS the failure. The only legitimate stops are the asks this skill mandates:
    the scope question (and its re-asks) before a file change, the offer to run before
    anything starts, and the fresh-window offer after a blocked window; nothing else ends
    the turn.
11. **The host is not yours.** Change only the repository. On the host, build and start this
    repository's own services and stop what you started; never prune, delete, restart, or
    reconfigure anything you did not create — docker images, containers, volumes, networks
    (no `prune`, no removal by filter, listing or age; only your own, by exact name),
    Kubernetes resources, packages, daemons, the docker VM. When the host blocks progress —
    disk full, a missing builder, the wrong architecture — say exactly what blocks and what
    it would take, mark the affected services `blocked`, and continue with the rest;
    clearing the blocker is the developer's call. `blocked` is for what building revealed;
    what the Inventory step already read off the base image stays `skipped` there.

## Workflow

1. Inventory, plan, and the one question (above).
2. Use the token-free `.env.otel.bluebox-template` at the repo root — `bluebox setup
   local-repos` generates it with the OTLP endpoint pre-filled (missing? fetch the
   endpoint via `bluebox otlp-endpoint`; exit 1 = workspace still provisioning — tell
   the user and continue wiring, do not poll in a loop; put the endpoint in the deployment
   entry, do not hand-write the template). Preserve the template's
   variable contract; never rename it or write a bare `.env.otel` (CLI tests reject
   that path). The ingest token stays out of it, always.
3. Wire each selected service per its plan row and the Hard rules. Update the start command
   and deployment config (compose/Helm/process manager) — non-secret defaults only; token
   only ever as a runtime env reference. Update run instructions the repo already has.
   After each service's build-verify, write its record to the state file (below).
4. Tell the user to paste the ingest token from the Bluebox Setup page into the env
   location you named (never ask to see it).
5. Only after the run offer in the next section is accepted: start the app once (its normal
   dev/compose command), drive one request per instrumented service (use the repo's load
   generator or reverse-proxy routes when present), and record the window start/end.

## State and resume

An interrupted run (closed terminal, lost session, a cap) must not start over. Once the
question is answered, before any service file changes, add `.bluebox/` to `.gitignore` if
it is not ignored and write `.bluebox/instrumentation-run.json`: the revision (`git rev-parse HEAD`), the level, the
scope, and one entry per planned service — `status` (`planned`, `wired`, `blocked`,
`skipped`), the files its plan row named as repository-relative paths, each with the sha256
of its content after your edit, and the detail the closing summary will carry. Update the
entry the moment its service's build-verify passes or it is marked `blocked`; no secrets in
it, ever. On start, read the file only if it parses, carries those fields, and every path is
relative and inside the repository; anything else is stale — say so and start fresh. A
record from the same revision whose scope and level match the request, with a service
still `planned`, is a resume: say "resuming: N of M wired", print the plan table with each
service's recorded status, take the recorded level as the answer already given, and continue
from the first service not `wired` or `blocked`. Per named file of that service: content
matching the recorded hash is your finished edit, keep it; matching the revision is untouched,
wire it; anything else is the developer's own work — stop and ask before touching it
(unattended: leave it, mark the service `blocked` with "edited since the plan"). A record
with nothing left `planned` is a finished run, not a resume; one whose scope or level differ
from the request, or whose revision differs from `HEAD`, is not either: say what it records
and ask whether to start over (unattended: start over and say why). Starting over
overwrites the record. The developer removes the file when they are done with it; the
closing summary names it under next steps when anything is not `wired`.

## Run it, then verify — once, batched, honestly

Nothing can arrive from an app that never ran. After wiring and build-verify, offer the run:
name the start command you found in the inventory (`docker compose -f compose.dev.yaml up -d`,
a dev script, a process manager), say what it will do — start the stack, send one request to
each instrumented service, through the reverse proxy where there is one, wait for the settle
interval, then verify once — and ask before starting anything. One request per service is
enough; a load generator is not the point.

If the user declines, or no user is present and you cannot start the stack, stop there and say
so: those services are `blocked`, their detail carries the command to run, and next steps
repeats it. Give the command with its secrets replaced — `--env-file .env.otel`, `$DT_TOKEN`,
a placeholder — never a value you read out of a file. The command has to be runnable, not a
word in backticks. Do not verify an app that is not running, and do not report `reporting` for
a service you never saw a signal from.

Verification happens EXACTLY once, after all wiring and the traffic window — never
mid-run, never per service. Build-verify (Hard rule 8) means compile/test only, not
emission checks. Local OTLP receivers are for the no-token/no-workspace case ONLY;
with a token present they are wasted minutes — skip straight to the batched check.

The three states of the closing summary are the whole vocabulary here too: a service is
`reporting` only when its signals arrived in Bluebox. Wired but never exercised, or seen only
by a disposable local receiver, is `blocked` — say what is missing in the detail (`no
workspace; a local receiver saw export`) and never claim success.

Wait ~90s after the traffic window (logs lag spans), then run ONE batched check covering
every selected service and ONLY the signals the user selected, minus per-service drops
declared under Hard rule 4 — a deliberate level-1
run is complete without logs or metrics:

```bash
bluebox ask --env <env> "For the window <T1>..<T2>: which of these services have <the
signals the user selected — e.g. spans, logs, and metrics> arriving — <service list>?
List per-service signals and the values of vcs.repository.url.full on their spans."
```

At most one follow-up ask for the missing set after one more settle interval — then report
the remaining services as `blocked`, with the evidence you do have in the detail; do not
loop. A `vcs.*` mismatch is a warning to report, not a verification failure, when the
signal itself arrived. No token or workspace available? Use a disposable local receiver,
report those services as `blocked` with `a local receiver saw export` in the detail, and give
the user the exact verification command to run once they have a workspace.

Before finishing: scan tracked changes for secrets (`dt0c01.`/`dt0s16.` prefixes, real
`OTEL_EXPORTER_OTLP_HEADERS` values, userinfo-bearing URLs). If the first window was blocked,
offer the run again for a fresh one.

## Closing summary (fixed shape)

End the run with these three blocks, in this order, built from what the run actually saw.
No essays, and nothing here that the run did not establish. One line first: "Time to first
telemetry: M min (expected L–H)", M from your first file change to the verification answer,
both times you have.

1. **One table, one row per service in the inventory** — every service you inventoried,
   in scope or not, exactly once (the ones a tier or the developer kept out of scope too,
   one row each, never grouped):

   | service | state | detail |
   |---|---|---|
   | pricing-service | reporting | traces, metrics, logs |
   | calculationservice | skipped | x86-only image, this host is arm64 |
   | problem-operator | blocked | runs only under Kubernetes; needs a cluster to verify |

   `reporting` means signals verified in-product, and the detail names which ones.
   `skipped` carries the census reason it was never in scope. `blocked` carries the
   concrete blocker and what would clear it. Those three words are the whole vocabulary:
   a service is in exactly one of them, and "configured", "done" or "partial" are not
   states — a service whose wiring you could not prove is `blocked`.

2. **Limitations** — only what this run's facts support: a service that serves no inbound
   HTTP has no request metrics, infrastructure (databases, brokers, proxies) is not covered
   without a collector, a service kept at level 2 exports no logs and why. Do not list
   limitations you did not hit.

3. **Next steps** — what the developer does now: where to look in Bluebox, what to run to
   re-verify, and the one thing that would move a `blocked` service to `reporting`. When
   anything is blocked, this block names a command, because "blocked" without the thing to
   run is not an answer:

   > **Limitations**: `db` and `rabbitmq` are infrastructure and need a collector, which this
   > run did not add. Six services stay at level 2, so they export no logs.
   >
   > **Next steps**: open the environment view for `docker-compose`. To verify
   > problem-operator, deploy the chart to a cluster and re-run
   > `bluebox ask --env docker-compose "which services have spans arriving?"`.

Also state, once: the files you changed, the env vars the user must supply, and anything
that reached your own output that should not have. Name that exposure without reproducing it
— "the ingest token was printed by `docker compose config`; rotate it", never the value
itself, and never a fragment of it. Your final message is recorded and read by others.

For deeper query patterns load the **`production-query`** skill. Kubernetes/host/datastore
telemetry via a Collector is a separate procedure — only on request.
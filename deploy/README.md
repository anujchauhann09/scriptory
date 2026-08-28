# Deploying Scriptory

The API ships as a plain OCI container with no vendor SDK and no vendor-specific
code path. Everything a host needs to tell it arrives as environment variables,
which `src/config/platform.js` normalises into a small set of values the rest of
the app reads:

| Normalised value  | What it decides                                    |
| ----------------- | -------------------------------------------------- |
| `trustProxyHops`  | how `req.ip` is derived — the key for rate limiting |
| `maxInstances`    | the budget every in-process rate limit is sized against |
| `isServerless`    | default pool size and default scheduler mode        |
| `instanceId`      | the instance tag on every log line                  |

`deploy/gcp/` is one adapter. Moving to ECS, Container Apps, Fly or Kubernetes
means writing an equivalent manifest and changing nothing in `src/`.

---

## 1. Provision

```bash
export PROJECT_ID=your-project REGION=asia-south1

gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com \
  servicenetworking.googleapis.com

gcloud artifacts repositories create scriptory --repository-format=docker --location=$REGION

# Private IP requires a VPC peering range for Google-managed services. One-time
# setup on the default VPC; skip if it already exists.
gcloud compute addresses create google-managed-services-default \
  --global --purpose=VPC_PEERING --prefix-length=16 --network=default
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-default --network=default

# db-f1-micro caps max_connections at 25 — which is why DB_POOL_MAX is 3 and
# maxScale is 2 (see "Connection pooling"). On a larger tier, raise
# DB_MAX_CONNECTIONS to match and the startup check will confirm the new budget.
gcloud sql instances create scriptory-db \
  --database-version=POSTGRES_16 --edition=enterprise \
  --tier=db-f1-micro --region=$REGION \
  --network=default --no-assign-ip \
  --require-ssl \
  --storage-auto-increase --backup --enable-point-in-time-recovery
gcloud sql databases create scriptory --instance=scriptory-db

# The private IP is what everything connects to. There is no public endpoint.
PRIVATE_IP=$(gcloud sql instances describe scriptory-db \
  --format='value(ipAddresses[0].ipAddress)')
echo "Cloud SQL private IP: $PRIVATE_IP"
```

> **Direct VPC egress consumes subnet addresses.** Each running Cloud Run
> instance takes an IP from the `default` subnet in `$REGION`. With
> `maxScale: 2` plus the migration job that is a handful of addresses against an
> auto-mode /20, which is not close to a constraint — but it is why the subnet
> has to exist in the same region as the service.

## 2. Secrets

Nothing sensitive belongs in an image, in `service.yaml`, or in a shell history.

```bash
create_secret() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic; }

create_secret scriptory-jwt-secret        "$(openssl rand -base64 48)"
create_secret scriptory-task-token        "$(openssl rand -base64 32)"
# TCP to the private IP. `sslmode=require` satisfies the instance's SSL-only
# setting; config/database.js would add it anyway, but stating it in the secret
# makes the intent explicit and survives a change to that default.
create_secret scriptory-database-url      "postgresql://scriptory:PASSWORD@${PRIVATE_IP}:5432/scriptory?sslmode=require"
create_secret scriptory-cloudinary-secret "..."
create_secret scriptory-smtp-pass         "..."
create_secret scriptory-gemini-key        "..."
```

Two runtime identities, neither able to do the other's job:

```bash
gcloud iam service-accounts create scriptory-api      # runs the service
gcloud iam service-accounts create scriptory-migrate  # runs migrations only

# Secret access is granted per secret, not project-wide. The migration identity
# can read the database URL and nothing else — not the JWT signing key, not the
# SMTP password.
for secret in scriptory-jwt-secret scriptory-task-token scriptory-database-url \
              scriptory-cloudinary-secret scriptory-smtp-pass scriptory-gemini-key; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:scriptory-api@$PROJECT_ID.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done

gcloud secrets add-iam-policy-binding scriptory-database-url \
  --member="serviceAccount:scriptory-migrate@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

**Neither identity is granted `roles/cloudsql.client`.** That role authorises the
Cloud SQL Auth Proxy against the Admin API; connecting straight to a private IP
over TCP is plain networking and needs no Cloud SQL IAM at all. Granting it
would be permission this deployment never exercises.

The build identity orchestrates and nothing more — it pushes images, manages
Cloud Run, and acts as the two runtime identities, but it is **never given the
database credential**.

**Confirm which identity actually runs your builds before granting anything.**
Cloud Build historically used `<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com`,
but projects onboarded since 2024 run builds as the **Compute Engine default
service account** instead. Granting roles to the wrong one looks like it worked
and still fails at the first Cloud Run call:

```bash
# Ask a real build who it ran as, rather than assuming.
gcloud builds list --limit=1 --format='value(serviceAccount)'

# Set CB_SA to whichever that reports, e.g.:
CB_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
# ...or the legacy identity on older projects:
# CB_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"
```

Then check what it already holds, and add only what is missing:

```bash
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten='bindings[].members' \
  --filter="bindings.members:$CB_SA" \
  --format='table(bindings.role)'
```

```bash
# Cloud Run Developer covers jobs and services both: run.jobs.get/create/update,
# run.jobs.run and run.executions.get (which --execute-now --wait need), plus
# run.services.* for the deploy step. It grants no IAM admin and no data access.
for role in roles/run.developer roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CB_SA" --role="$role" --condition=None
done

# Both pipeline steps pass --service-account=, which is an actAs on that
# identity. Granted per service account, never project-wide, so the build can
# impersonate exactly these two and nothing else in the project.
for sa in scriptory-api scriptory-migrate; do
  gcloud iam service-accounts add-iam-policy-binding \
    "$sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --member="serviceAccount:$CB_SA" --role=roles/iam.serviceAccountUser
done
```

`roles/run.developer` is granted at project level rather than per job, because
the migration job does not exist until the pipeline creates it — there is nothing
to scope a binding to on the first run. It is still far narrower than Editor: it
confers no ability to read secrets, alter IAM, or touch Cloud SQL.

Every secret also supports a `_FILE` variant (`JWT_SECRET_FILE=/secrets/jwt`),
which is how you would mount it as a volume on GKE, ECS or Docker Swarm. The app
prefers the file when both are present.

## 3. Deploy

`service.yaml` is the full declarative definition — scaling, env, secrets,
probes. Apply it once (and whenever that config changes) before the first
pipeline run; afterwards the pipeline only rolls the image forward.

```bash
# Fill in PROJECT_ID / REGION / the image reference first.
gcloud run services replace deploy/gcp/service.yaml --region=$REGION

gcloud builds submit --config=deploy/gcp/cloudbuild.yaml     # build → push → migrate → deploy
PROJECT_ID=$PROJECT_ID REGION=$REGION API_URL=https://... ./deploy/gcp/scheduler-jobs.sh
```

### First deployment: the API_URL chicken-and-egg

Cloud Run mints the service URL only once the service exists, but `API_URL` is
required in production — so the very first revision cannot know its own address.

Deploy twice. The first pass sets one explicit flag:

```bash
# Pass 1 — boot once without a public URL.
gcloud run services update scriptory-api --region=$REGION \
  --update-env-vars=API_URL_PENDING=true

gcloud builds submit --config=deploy/gcp/cloudbuild.yaml

# Read the URL Cloud Run generated. Never guess this format.
API_URL=$(gcloud run services describe scriptory-api --region=$REGION \
  --format='value(status.url)')
echo "Generated URL: $API_URL"

# Pass 2 — set the real value and drop the flag.
gcloud run services update scriptory-api --region=$REGION \
  --update-env-vars=API_URL=$API_URL \
  --remove-env-vars=API_URL_PENDING
```

Then point the scheduler at the same URL, and set `FRONTEND_URL` on the API plus
`VITE_API_URL` on the frontend build to match.

**What the flag does and does not do.** It is honoured *only* when `API_URL` is
genuinely absent, and it does not loosen the rule — it narrows the blast radius
to the one feature that needs an absolute API URL:

| | During bootstrap | After pass 2 |
|---|---|---|
| Service boots | yes | yes |
| Canonical links, RSS, sitemap | correct (`FRONTEND_URL`) | correct |
| CORS, SPA CSRF | correct (`FRONTEND_URL`) | correct |
| Newsletter emails | **withheld** | sent |
| Unsubscribe form origin in CSRF allowlist | omitted | present |
| Startup log | **error, every boot** | silent |

Withholding the emails is the point. An unsubscribe link is not decoration — a
bulk email carrying a broken one cannot be opted out of, which is the part that
is legally required. Subscribers are still recorded during bootstrap; only the
mail is held back, so nothing is lost.

Setting `API_URL` makes the flag inert, so it cannot quietly become permanent —
and the error-level log on every startup makes leaving it set unpleasant enough
to notice.

**Why not the alternatives:** a placeholder sends real mail pointing at a domain
you do not own; guessing the `run.app` hostname bakes in a format Google does not
guarantee; and deriving it from the request's `Host` header is host-header
injection — an attacker sends `Host: evil.example` and the next unsubscribe link
carries a live token to their server.

### Why migrations run in a Cloud Run Job

Cloud SQL has a **private IP only**, and Cloud Build's default pool runs outside
the VPC. No build step can route to an RFC1918 address from there — the Cloud SQL
Auth Proxy included, since it cannot create a network path that does not exist.
The pipeline used to try exactly that, and could not have worked.

The three ways out, and why this one:

| Option | Verdict |
|---|---|
| Private Cloud Build worker pool | Works, but it is a paid pool that exists solely to run one `migrate` step. |
| Give Cloud SQL a public IP | Works, and discards the private-only decision. |
| **Cloud Run Job with Direct VPC egress** | Runs the image just built, on the VPC, at no additional cost. |

The job uses the **same image** as the service, so the migrations applied are
exactly the ones the incoming revision was built against — there is no separate
migration image to drift. `--execute-now --wait` makes the build block on it, so
the deploy step cannot start until the schema is in place.

Migrations still do not run at container startup: every instance in a scale-out
would race to apply them, and a bad migration would crash-loop the service
instead of failing one pipeline step.

A useful side effect of the job reading its own secret: **Cloud Build no longer
has access to the database credential at all**, so it cannot appear in a build
log or be read by anything with build-viewer access.

## 4. Frontend

```bash
cd frontend && VITE_API_URL="https://api.example.com/api" npm run build
```

`VITE_API_URL` is compiled into the bundle as a literal. A production build now
refuses to proceed if it is missing, points at localhost, or is not `https://` —
a bundle is immutable once built, so a stale value ships a site that calls the
wrong host from every visitor's browser.

Serve `dist/` from any static host. Set `FRONTEND_URL` on the API to that origin;
it drives CORS, the CSRF allowlist, and canonical links.

---

## Rate limiting: what it does and does not guarantee

Every limiter is in-process (`express-rate-limit`'s memory store). No Redis, no
managed rate-limit service. Two consequences follow directly, and the design
accounts for them rather than glossing over them:

**Limits are per instance.** With `MAX_INSTANCES=2`, a client spread across both
gets up to 2× the configured limit. There is no shared counter. (Lowering the
instance cap for the database's sake tightened this as a side effect.)

**Counters reset when an instance is replaced.** A deploy, a scale-in, or an
idle scale-to-zero wipes the window.

That is an acceptable trade for volumetric abuse — an attacker large enough to
saturate every instance is a load event the autoscaler already surfaces — but it
is *not* acceptable for credential guessing, where the attacker only has to win
once and N instances multiply their budget directly.

So brute-force protection is split in two:

- **In-process** (`middleware/rateLimit.middleware.js`) — cheap volumetric
  shedding, per instance, no database call on the reject path.
- **Database-backed** (`utils/loginThrottle.js`) — a genuinely global per-account
  and per-IP lockout, using the Postgres instance the app already depends on.
  One indexed upsert per *failed* attempt; nothing at all on the success path.
  It fails open if the table is unreachable, so a database blip degrades to
  per-instance limits rather than taking login down.

`MAX_INSTANCES` is therefore a security control, not just a cost lever. Keep it
equal to `autoscaling.knative.dev/maxScale`.

| Limiter        | Per instance | Window | Keyed by      | Why this number                                                        |
| -------------- | ------------ | ------ | ------------- | ---------------------------------------------------------------------- |
| global `/api`  | 300          | 1 min  | client IP     | one article view is ~6 requests; a hard browser stays well under it     |
| auth           | 10 failures  | 15 min | client IP     | successes are not counted, so this counts guesses, not sessions         |
| register       | 5            | 1 hour | client IP     | successes *are* counted here, so it needs its own bucket                |
| 2FA            | 10 failures  | 15 min | account       | six digits is 1-in-a-million; unthrottled it is brute forceable         |
| public write   | 5            | 10 min | client IP     | contact sends two emails, subscribe sends one — real money per request  |
| authed write   | 30           | 1 min  | account       | per account, so one abuser cannot spend an office NAT's budget          |
| search         | 30           | 1 min  | account or IP | full-text scan + COUNT; the cheapest way to run up a database bill      |
| image render   | 20           | 1 min  | client IP     | sharp rasterisation is the most CPU-hungry path in the service          |
| upload         | 20           | 10 min | account       | bandwidth plus paid third-party storage                                 |
| broadcast      | 3            | 1 hour | account       | a double-click must not mean a duplicate mailing                        |

Development multiplies every limit by 50.

## Connection pooling

The number that matters is **not** steady state. During a rolling deploy the old
revision is still serving while the new one starts, so both revisions hold full
pools at once:

```
steady state      = DB_POOL_MAX × MAX_INSTANCES        = 3 × 2  =  6
peak (mid-deploy) = steady × 2 (revisions overlap)              = 12
available         = tier max_connections − superuser reserved
                  = 25 − 3                                      = 22
headroom                                                        = 10
```

That headroom is what migrations, `psql`, and Cloud SQL's own tooling use.
Budgeting against steady state alone under-counts by half at exactly the moment
the system can least absorb a failure — and a deploy that cannot open a
connection is indistinguishable from a deploy that crashed.

The app checks this arithmetic itself at startup from `DB_MAX_CONNECTIONS` and
logs at **error** level if it no longer fits. It does not refuse to boot: a pool
that overruns the tier still works at low traffic, so failing closed would turn a
latent capacity problem into an immediate outage — and would block the very
deploy that fixes it.

> **`db-f1-micro` gives you 25 connections, not hundreds.** The earlier
> `5 × 4 = 20` shape in this file was sized for `db-g1-small` and does not fit:
> it peaks at 40 mid-deploy against a limit of 25. If you move to a larger tier,
> raise `DB_MAX_CONNECTIONS` first and let the startup check confirm the new
> numbers.

`DB_POOL_MAX=3` is small on purpose. Node is single-threaded: it cannot usefully
run more queries in parallel than a small multiple of its CPU count, so a large
pool buys nothing but consumed connection slots. With `containerConcurrency: 80`,
requests queue *in-process* on the pool — which is cheap — rather than the
platform opening more sockets to the database, which is expensive and capped.
`DB_POOL_TIMEOUT=10` makes that queue fail fast instead of piling up, and the
resulting Prisma `P2024` is mapped to a `503` so callers and load balancers can
retry. Three is also Prisma's own default for a single vCPU (`num_cpus * 2 + 1`).

Exceeding a managed database's `max_connections` does not degrade gracefully —
it fails every instance at once. Recompute this product before raising either
number.

The connection URL is assembled in `src/config/database.js`. **This deployment
leaves `DB_SOCKET_PATH` unset** and connects over TCP to the Cloud SQL private
IP, because the Unix-socket integration resolves the instance over its public
endpoint and there isn't one. `sslmode=require` is added automatically for TCP in
production, satisfying the instance's SSL-only setting; an explicit `sslmode` in
`DATABASE_URL` is respected rather than overwritten, so `verify-ca` is available
if you distribute the server CA.

`DB_SOCKET_PATH` remains supported for platforms that genuinely mount a socket.

## Background work

`SCHEDULER_MODE=external` on any autoscaled deployment — and it is the automatic
default whenever the platform adapter reports a serverless runtime. In-process
cron is wrong in both directions on Cloud Run: scaled to zero the job never
fires, scaled out every instance fires it.

Moving the trigger outside the app fixes the *scheduling*, but not delivery
semantics. **Cloud Scheduler is at-least-once**: it retries on any non-2xx and on
an attempt deadline it did not hear back from, which includes the case where the
work completed and only the response was lost. So each task states its own
guarantee:

| Task | Frequency | Protection | Why |
|---|---|---|---|
| `publish-scheduled` | every 5 min | **none, deliberately** | One conditional `updateMany`. Two runs converge on the same state; the loser reports zero rows. Leasing the most frequent task to guard against something that cannot happen would just add a write per tick. |
| `maintenance` | daily | lease + **day** key | Idempotent deletes, but bulk ones — no reason to let a retry stack a second sweep on a shared-core database. |
| `newsletter-digest` | weekly | lease + **ISO-week** key | The one task where a retry is visible to users: a second copy in every subscriber's inbox. |

The lease lives in the `TaskLease` table — the Postgres instance the app already
depends on, no Redis and no coordination service. It gives two things, decided in
a single atomic upsert so concurrent callers cannot both win:

- **`lockedUntil`** — mutual exclusion. A lease rather than a lock, so a
  container killed mid-task cannot wedge the job forever; it simply expires.
- **`lastRunKey`** — replay protection. A retry carrying the key of a run that
  already completed is skipped, and the endpoint answers **200** so the scheduler
  stops retrying. Reporting a skip as an error would cause the exact retry storm
  the lease exists to prevent.

A *failed* run does not record its key, so the scheduler's retry is still allowed
to do the work — which is the point of retrying.

The admin "Send digest" button goes through the same lease, so it cannot overlap
the cron. It passes no run key: the admin is explicitly asking to send now, and
that intent should not be swallowed by a key saying the week is done.

The three tasks are exposed at `/internal/tasks/*` behind a constant-time bearer
check against `TASK_RUNNER_TOKEN`. An unset token leaves them returning 404 —
the feature fails closed. Any scheduler can drive them; `scheduler-jobs.sh` wires
up Cloud Scheduler.

## Operational notes

- **Health**: `/healthz` is liveness and never touches the database — if it did,
  a database blip would make every instance look dead and trigger a simultaneous
  restart. `/readyz` does check the database and gates the startup probe.
- **Shutdown**: SIGTERM stops the scheduler, stops accepting connections, drains
  in-flight requests, then closes the pool, with a hard deadline at
  `SHUTDOWN_TIMEOUT_MS` (keep it under Cloud Run's 10s grace period).
- **Timeouts**: `KEEP_ALIVE_TIMEOUT_MS` (65s) must stay *above* the fronting load
  balancer's idle timeout, or the proxy reuses a socket the server just closed
  and reports a 502 for a request the app never saw.
- **Logs**: one JSON object per line on stdout, parsed natively by Cloud Logging.
  Passwords, tokens, and query-string secrets are redacted before writing —
  notably the unsubscribe token, which previously appeared in full in every
  request log line.
- **Timestamps in raw SQL**: Prisma writes `DateTime` as UTC into a
  `timestamp without time zone` column, while Postgres `now()` is a `timestamptz`
  that converts through the *session* zone. Any raw SQL touching those columns
  uses `now() AT TIME ZONE 'UTC'` so SQL-written and Prisma-written values agree.
  Cloud SQL runs UTC so a mistake here is invisible in production and hours wrong
  on a developer's machine — there is a regression test pinning it.
- **Trust proxy**: `TRUST_PROXY_HOPS=1` for Cloud Run direct. Add a global
  external load balancer in front and it becomes `2` — get this wrong and either
  clients can forge `X-Forwarded-For` to evade every limit, or every request
  keys on the load balancer's address and the whole world shares one bucket.
- **Search index**: the full-text GIN index is raw SQL in
  `20260827025356_add_login_throttle_and_search_index`, because Prisma cannot
  express an expression index in `schema.prisma`. `prisma migrate dev` may
  therefore propose dropping it as drift — keep it, and re-add it if a generated
  migration removes it.

## Porting to another provider

1. Add an adapter entry to `ADAPTERS` in `src/config/platform.js` (detection
   variable, instance id, proxy hop count).
2. Write the equivalent manifest — the container, its env vars, and its secrets.
3. Point `DB_SOCKET_PATH` at a socket, or leave it unset for TCP.
4. Replace `deploy/gcp/scheduler-jobs.sh` with whatever cron the platform offers,
   calling the same three `/internal/tasks/*` endpoints.

No application code changes.

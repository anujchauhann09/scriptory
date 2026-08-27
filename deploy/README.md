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
export PROJECT_ID=your-project REGION=us-central1

gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud artifacts repositories create scriptory --repository-format=docker --location=$REGION

# db-g1-small, not a shared-core tier: shared-core caps max_connections around
# 25, which leaves almost no room once migrations and admin sessions are
# counted alongside the app's pool.
gcloud sql instances create scriptory-db \
  --database-version=POSTGRES_16 --tier=db-g1-small --region=$REGION \
  --storage-auto-increase --backup --enable-point-in-time-recovery
gcloud sql databases create scriptory --instance=scriptory-db
```

## 2. Secrets

Nothing sensitive belongs in an image, in `service.yaml`, or in a shell history.

```bash
create_secret() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic; }

create_secret scriptory-jwt-secret        "$(openssl rand -base64 48)"
create_secret scriptory-task-token        "$(openssl rand -base64 32)"
create_secret scriptory-database-url      "postgresql://scriptory:PASSWORD@localhost/scriptory?host=/cloudsql/$PROJECT_ID:$REGION:scriptory-db"
create_secret scriptory-cloudinary-secret "..."
create_secret scriptory-smtp-pass         "..."
create_secret scriptory-gemini-key        "..."

# The service account gets secretAccessor and cloudsql.client, and nothing else.
gcloud iam service-accounts create scriptory-api
for role in roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:scriptory-api@$PROJECT_ID.iam.gserviceaccount.com" --role="$role"
done
```

Every secret also supports a `_FILE` variant (`JWT_SECRET_FILE=/secrets/jwt`),
which is how you would mount it as a volume on GKE, ECS or Docker Swarm. The app
prefers the file when both are present.

## 3. Deploy

```bash
gcloud builds submit --config=deploy/gcp/cloudbuild.yaml     # build → migrate → deploy
gcloud run services replace deploy/gcp/service.yaml --region=$REGION
PROJECT_ID=$PROJECT_ID REGION=$REGION API_URL=https://... ./deploy/gcp/scheduler-jobs.sh
```

Migrations run as a build step, not at container startup: at startup every
instance in a scale-out event would race to migrate the same database, and a bad
migration would crash-loop the service instead of failing one build step.

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

**Limits are per instance.** With `MAX_INSTANCES=4`, a client spread across all
four gets up to 4× the configured limit. There is no shared counter.

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

```
total connections = DB_POOL_MAX × MAX_INSTANCES
                  = 5 × 4
                  = 20
```

against a `db-g1-small` (a few hundred connections), leaving ample headroom for
migrations, `psql`, and Cloud SQL's own overhead.

`DB_POOL_MAX=5` is small on purpose. Node is single-threaded: it cannot usefully
run more queries in parallel than a small multiple of its CPU count, so a large
pool buys nothing but consumed connection slots. With `containerConcurrency: 80`,
requests queue *in-process* on the pool — which is cheap — rather than the
platform opening more sockets to the database, which is expensive and capped.
`DB_POOL_TIMEOUT=10` makes that queue fail fast instead of piling up, and the
resulting Prisma `P2024` is mapped to a `503` so callers and load balancers can
retry.

Exceeding a managed database's `max_connections` does not degrade gracefully —
it fails every instance at once. Recompute this product before raising either
number.

The connection URL is assembled in `src/config/database.js`. Set `DB_SOCKET_PATH`
for a mounted Unix socket (Cloud SQL on Cloud Run); leave it unset for TCP (RDS,
Neon, Supabase, self-hosted), where `sslmode=require` is added automatically in
production.

## Background work

`SCHEDULER_MODE=external` on any autoscaled deployment. In-process cron is wrong
in both directions there: scaled to zero, the job never fires; scaled out, every
instance fires it. Publishing due drafts is idempotent so duplicates are
harmless, but the newsletter digest would mail every subscriber once per
instance.

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

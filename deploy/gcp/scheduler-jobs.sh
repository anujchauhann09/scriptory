#!/usr/bin/env bash
# ===========================================================================
# Background work, driven from outside the container.
#
# The API exposes three task endpoints under /internal/tasks/. Any scheduler can
# call them — Cloud Scheduler here, but a GitHub Actions cron, a Kubernetes
# CronJob, or a plain crontab with curl would work identically. Nothing about
# the app depends on which one you use.
#
# Why not in-process cron: with minScale 0 there may be no instance at the
# scheduled moment, so the job silently never runs; with several instances every
# one of them runs it. For an idempotent job that is merely wasteful, but the
# newsletter digest would send one copy per instance to every subscriber.
#
# Authentication is the shared TASK_RUNNER_TOKEN, passed as a bearer token. It
# is fetched from Secret Manager at job-creation time so it never appears in
# shell history or in this file.
# ===========================================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:?set REGION}"
API_URL="${API_URL:?set API_URL, e.g. https://api.scriptory.example.com}"

TASK_TOKEN="$(gcloud secrets versions access latest --secret=scriptory-task-token --project="$PROJECT_ID")"

create_job() {
  local name="$1" schedule="$2" path="$3" deadline="$4"
  gcloud scheduler jobs create http "$name" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="$schedule" \
    --time-zone="UTC" \
    --uri="${API_URL}${path}" \
    --http-method=POST \
    --headers="Authorization=Bearer ${TASK_TOKEN}" \
    --attempt-deadline="$deadline" \
    --max-retry-attempts=3 \
    || gcloud scheduler jobs update http "$name" \
        --project="$PROJECT_ID" \
        --location="$REGION" \
        --schedule="$schedule" \
        --uri="${API_URL}${path}" \
        --update-headers="Authorization=Bearer ${TASK_TOKEN}"
}

# Publishes drafts whose publishAt has passed. Idempotent — a duplicate run is a
# no-op — so a missed or repeated firing is harmless.
create_job scriptory-publish-scheduled "*/5 * * * *" "/internal/tasks/publish-scheduled" "60s"

# Expires login-throttle counters and trims the audit log past its retention
# window. Off-peak, since it deletes rows.
create_job scriptory-maintenance "17 3 * * *" "/internal/tasks/maintenance" "300s"

# The weekly digest. This is the one job where the scheduler's at-least-once
# behaviour matters: it retries on a deadline it did not hear back from, which
# includes the case where the send actually completed. The handler is protected
# by a database lease keyed on the ISO week, so a retry inside the same week is
# skipped and answers 200 — the scheduler stops, and no subscriber is mailed
# twice. The send itself batches with an internal deadline, so a large list
# degrades to "incomplete" rather than being cut off mid-flight.
create_job scriptory-newsletter-digest "0 9 * * 1" "/internal/tasks/newsletter-digest" "540s"

echo "Scheduler jobs created or updated."

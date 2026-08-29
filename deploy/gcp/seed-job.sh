#!/usr/bin/env bash
# ===========================================================================
# One-time admin seed, as a Cloud Run Job.
#
# Cloud SQL is private-IP only, so nothing outside the VPC can reach it — the
# same constraint that puts migrations in a job puts the seed here too.
#
# Why a *separate* job rather than a flag on the API service: the admin password
# is needed exactly once, to hash and insert one row. Mounting it on the service
# would place the credential in the environment of every request-serving
# container, permanently, for a value none of them ever reads. Here it is scoped
# to a single execution by a single identity, and can be revoked immediately
# afterwards (see "cleanup" at the bottom).
#
# The seed is idempotent: it reports "Admin already exists" and changes nothing
# if the account is present. That makes it safe to run as a *check* — running it
# is how you find out whether the database has been seeded.
# ===========================================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-scriptory-api}"
JOB="${JOB:-scriptory-seed}"
ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL, e.g. admin@scriptory.com}"
SEED_SA="scriptory-seed@${PROJECT_ID}.iam.gserviceaccount.com"

# Seed with the image the service is actually running, so the Prisma client and
# schema match the deployed database exactly.
IMAGE="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].image)')"
echo "Seeding with image: $IMAGE"

gcloud run jobs deploy "$JOB" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SEED_SA" \
  `# Direct VPC egress, exactly as the migration job: reaches the Cloud SQL` \
  `# private IP with no connector, no NAT and no public endpoint.` \
  --network=default \
  --subnet=default \
  --vpc-egress=private-ranges-only \
  `# Both secrets are read by the job itself, so neither passes through the` \
  `# caller's shell or a build log.` \
  --set-secrets="DATABASE_URL=scriptory-database-url:latest,ADMIN_PASSWORD=scriptory-admin-password:latest" \
  `# NODE_ENV=production is deliberate: it switches the seed's weak-password` \
  `# check from a warning to a refusal. An admin account is the whole system,` \
  `# so a guessable password must fail the job, not print a caution.` \
  --set-env-vars="NODE_ENV=production,ADMIN_EMAIL=${ADMIN_EMAIL}" \
  --command=npm \
  --args=run,seed \
  `# No retries: this is a deliberate one-shot and its output is the answer.` \
  --max-retries=0 \
  --task-timeout=5m \
  --memory=512Mi \
  --execute-now \
  --wait

echo
echo "Done. Check the execution log for one of:"
echo "  'Admin created: <email> (id: N)'  -> the database was empty and is now seeded"
echo "  'Admin already exists: <email>'   -> it was already seeded; the 401 is a password mismatch"
echo "  'Refusing to seed: ...'           -> the stored password fails the strength check"
echo
echo "Cleanup once the admin can sign in — removes the standing grant on the"
echo "admin password so nothing in the project can read it unattended:"
echo "  gcloud run jobs delete $JOB --project=$PROJECT_ID --region=$REGION --quiet"
echo "  gcloud secrets remove-iam-policy-binding scriptory-admin-password \\"
echo "    --project=$PROJECT_ID --member=serviceAccount:$SEED_SA \\"
echo "    --role=roles/secretmanager.secretAccessor"

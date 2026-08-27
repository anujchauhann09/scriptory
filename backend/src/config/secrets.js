/**
 * Secret loading, provider-agnostic.
 *
 * Every managed platform can surface a secret in one of two shapes:
 *   - as an environment variable  (Cloud Run --set-secrets=FOO=secret:latest,
 *     ECS valueFrom, Heroku config vars, plain .env in development)
 *   - as a file on disk           (Cloud Run/GKE secret volume mounts,
 *     Kubernetes secrets, Docker/Swarm secrets)
 *
 * File-mounted secrets are strictly better in production: they never appear in
 * `docker inspect`, in a crash dump of process.env, or in a child process's
 * environment, and they can be rotated without a redeploy. So for every secret
 * `FOO` we also honour `FOO_FILE` pointing at the mount path, and prefer it.
 */
const fs = require("fs");

const cache = new Map();

const readSecret = (name, { required = false, fallback = undefined } = {}) => {
  if (cache.has(name)) return cache.get(name);

  let value;
  const filePath = process.env[`${name}_FILE`];

  if (filePath) {
    try {
      // Trailing newlines are near-universal in mounted secret files.
      value = fs.readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
    } catch (err) {
      // Never echo the path's contents; the path itself is safe to name.
      throw new Error(`Could not read secret "${name}" from ${filePath}: ${err.code || err.message}`);
    }
  } else if (process.env[name] !== undefined && process.env[name] !== "") {
    value = process.env[name];
  } else {
    value = fallback;
  }

  if (required && (value === undefined || value === "")) {
    throw new Error(`Missing required secret: set ${name} or ${name}_FILE`);
  }

  cache.set(name, value);
  return value;
};

/** Redacts a secret for log/diagnostic output — never logs the value itself. */
const describeSecret = (name) => {
  const value = readSecret(name);
  if (!value) return `${name}=<unset>`;
  return `${name}=<set, ${value.length} chars>`;
};

module.exports = { readSecret, describeSecret };

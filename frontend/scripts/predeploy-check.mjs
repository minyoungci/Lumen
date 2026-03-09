import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const args = new Set(process.argv.slice(2));
const isProduction =
  args.has("--production") ||
  process.env.VERCEL === "1" ||
  process.env.NODE_ENV === "production";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const parsed = {};
  const raw = readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

const envSources = [
  process.env,
  parseEnvFile(path.join(cwd, ".env.production.local")),
  parseEnvFile(path.join(cwd, ".env.production")),
  parseEnvFile(path.join(cwd, ".env.local")),
];

function readEnvValue(key) {
  for (const source of envSources) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function fail(message) {
  console.error(`\n[predeploy] ${message}`);
  process.exit(1);
}

function runStep(label, scriptPath, extraArgs = []) {
  console.log(`\n[predeploy] ${label}`);
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const requiredKeys = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

for (const key of requiredKeys) {
  if (!readEnvValue(key)) {
    fail(`Missing required environment variable: ${key}`);
  }
}

if (isProduction) {
  const apiUrl = readEnvValue("NEXT_PUBLIC_API_URL");
  const supabaseUrl = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const bypass = readEnvValue("NEXT_PUBLIC_DEV_BYPASS_AUTH");

  if (/localhost|127\.0\.0\.1/i.test(apiUrl)) {
    fail("Production API URL still points to localhost.");
  }

  if (/localhost|127\.0\.0\.1/i.test(supabaseUrl)) {
    fail("Production Supabase URL still points to localhost.");
  }

  if (!/^https:\/\//i.test(apiUrl) || !/^https:\/\//i.test(supabaseUrl)) {
    fail("Production API and Supabase URLs must use https.");
  }

  if (bypass && bypass !== "false") {
    fail("NEXT_PUBLIC_DEV_BYPASS_AUTH must be false in production.");
  }

  if (/your_|example|dev-anon-key/i.test(anonKey)) {
    fail("Production Supabase anon key still looks like a placeholder.");
  }
}

runStep("Lint", path.join(cwd, "node_modules", "eslint", "bin", "eslint.js"), [
  "app/**/*.tsx",
  "components/**/*.tsx",
  "hooks/**/*.ts",
  "lib/**/*.ts",
  "store/**/*.ts",
  "--max-warnings=0",
]);

runStep("Typecheck", path.join(cwd, "node_modules", "typescript", "bin", "tsc"), [
  "--noEmit",
]);

runStep("Build", path.join(cwd, "node_modules", "next", "dist", "bin", "next"), [
  "build",
]);

console.log("\n[predeploy] All checks passed.");

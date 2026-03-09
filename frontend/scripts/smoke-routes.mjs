const baseUrlInput = process.env.SMOKE_BASE_URL || process.argv[2];

if (!baseUrlInput) {
  console.error("Usage: npm run smoke:routes -- https://your-site.example");
  process.exit(1);
}

const baseUrl = new URL(baseUrlInput.endsWith("/") ? baseUrlInput : `${baseUrlInput}/`);
const routes = ["/", "/login", "/shared", "/shared/paper-reviews", "/daily-log", "/schedule", "/pricing"];

let hasFailure = false;

for (const route of routes) {
  const target = new URL(route.replace(/^\//, ""), baseUrl);

  try {
    const response = await fetch(target, {
      redirect: "manual",
      headers: { "user-agent": "labbase-smoke-check/1.0" },
    });

    const ok = response.status >= 200 && response.status < 400;
    const label = ok ? "OK" : "FAIL";
    console.log(`[smoke] ${label} ${response.status} ${target.toString()}`);

    if (!ok) {
      hasFailure = true;
    }
  } catch (error) {
    hasFailure = true;
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    console.log(`[smoke] FAIL request-error ${target.toString()} :: ${message}`);
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("[smoke] Route smoke check passed.");

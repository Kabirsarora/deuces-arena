const webUrl = process.env.SMOKE_WEB_URL ?? "https://deuces-arena.vercel.app";
const serverUrl = process.env.SMOKE_SERVER_URL ?? "https://deuces-arena.onrender.com";
const requireRealtimeAuth = process.env.SMOKE_REQUIRE_REALTIME_AUTH !== "false";

const checks = [];

function record(label, passed, detail) {
  checks.push({ label, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${label}: ${detail}`);
}

async function fetchWithWakeup(url) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "deuces-arena-production-smoke/1.0" },
        signal: AbortSignal.timeout(70_000)
      });

      if (response.ok || attempt === 3) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }

  throw lastError;
}

async function checkPage(path, expectedText) {
  const url = new URL(path, webUrl);

  try {
    const response = await fetchWithWakeup(url);
    const body = await response.text();
    const passed = response.ok && body.includes(expectedText);
    record(
      url.pathname,
      passed,
      `HTTP ${response.status}; expected content ${passed ? "found" : "missing"}`
    );
  } catch (error) {
    record(url.pathname, false, error instanceof Error ? error.message : String(error));
  }
}

await checkPage("/", "Choose a Table");
await checkPage("/privacy", "Privacy Policy");
await checkPage("/terms", "Terms of Service");
await checkPage("/auth/sign-in", "Sign in");

try {
  const healthUrl = new URL("/health", serverUrl);
  const response = await fetchWithWakeup(healthUrl);
  const health = await response.json();

  record("realtime health", response.ok && health.ok === true, `HTTP ${response.status}`);
  record("production environment", health.environment === "production", String(health.environment));
  record("PostgreSQL", health.config?.database === "configured", String(health.config?.database));
  record(
    "allowed web origin",
    Array.isArray(health.allowedOrigins) && health.allowedOrigins.includes(new URL(webUrl).origin),
    Array.isArray(health.allowedOrigins) ? health.allowedOrigins.join(", ") : "missing"
  );

  if (requireRealtimeAuth) {
    record(
      "signed realtime identity",
      health.config?.realtimeAuth === "configured",
      String(health.config?.realtimeAuth)
    );
  }
} catch (error) {
  record("realtime health", false, error instanceof Error ? error.message : String(error));
}

const failures = checks.filter((check) => !check.passed);

console.log(`\n${checks.length - failures.length}/${checks.length} production checks passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}

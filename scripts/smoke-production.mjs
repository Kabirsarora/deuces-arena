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

async function checkAsset(path, expectedType) {
  const url = new URL(path, webUrl);

  try {
    const response = await fetchWithWakeup(url);
    const contentType = response.headers.get("content-type") ?? "missing";
    const body = await response.arrayBuffer();
    const passed = response.ok && contentType.includes(expectedType) && body.byteLength > 1_000;
    record(
      url.pathname,
      passed,
      `HTTP ${response.status}; ${contentType}; ${body.byteLength} bytes`
    );
  } catch (error) {
    record(url.pathname, false, error instanceof Error ? error.message : String(error));
  }
}

await checkPage("/", "Choose a Table");
await checkPage("/privacy", "Privacy Policy");
await checkPage("/terms", "Terms of Service");
await checkPage("/auth/sign-in", "Sign in");
await checkPage("/manifest.webmanifest", '"name":"Deuces Arena"');
await checkPage("/sitemap.xml", `${new URL(webUrl).origin}/privacy`);
await checkAsset("/icon", "image/png");
await checkAsset("/apple-icon", "image/png");
await checkAsset("/opengraph-image", "image/png");

try {
  const response = await fetchWithWakeup(new URL("/", webUrl));
  const protectedHeaders =
    response.headers.get("x-content-type-options") === "nosniff" &&
    response.headers.get("x-frame-options") === "DENY";

  record(
    "web security headers",
    response.ok && protectedHeaders,
    `HTTP ${response.status}; ${protectedHeaders ? "configured" : "missing"}`
  );
} catch (error) {
  record("web security headers", false, error instanceof Error ? error.message : String(error));
}

try {
  const healthUrl = new URL("/health", serverUrl);
  const response = await fetchWithWakeup(healthUrl);
  const health = await response.json();

  record("realtime health", response.ok && health.ok === true, `HTTP ${response.status}`);
  record(
    "server security headers",
    response.headers.get("x-content-type-options") === "nosniff" &&
      response.headers.get("x-frame-options") === "DENY" &&
      response.headers.get("x-powered-by") === null,
    `HTTP ${response.status}`
  );
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

try {
  const response = await fetch(new URL("/admin/moderation", serverUrl), {
    headers: { "user-agent": "deuces-arena-production-smoke/1.0" },
    signal: AbortSignal.timeout(70_000)
  });

  record(
    "admin route protection",
    response.status === 401,
    `HTTP ${response.status}; expected 401 without a signed admin token`
  );
} catch (error) {
  record("admin route protection", false, error instanceof Error ? error.message : String(error));
}

const failures = checks.filter((check) => !check.passed);

console.log(`\n${checks.length - failures.length}/${checks.length} production checks passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}

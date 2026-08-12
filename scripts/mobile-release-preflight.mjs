import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const offline = process.argv.includes("--offline");
const webUrl = process.env.MOBILE_PREFLIGHT_WEB_URL ?? "https://deucesarena.com";
const serverUrl = process.env.MOBILE_PREFLIGHT_SERVER_URL ?? "https://api.deucesarena.com";
const expectedBundleId = "com.deucesarena.app";
const results = [];

function record(level, label, detail) {
  results.push({ level, label, detail });
  console.log(`${level} ${label}: ${detail}`);
}

function pass(label, detail) {
  record("PASS", label, detail);
}

function fail(label, detail) {
  record("FAIL", label, detail);
}

function warn(label, detail) {
  record("WARN", label, detail);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

async function fetchWithWakeup(url) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "deuces-arena-mobile-preflight/1.0" },
        signal: AbortSignal.timeout(70_000)
      });

      if (response.ok || attempt === 3) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 2_000));
  }

  throw lastError;
}

async function checkPage(path, expectedText) {
  try {
    const response = await fetchWithWakeup(new URL(path, webUrl));
    const body = await response.text();
    if (response.ok && body.includes(expectedText)) pass(path, `HTTP ${response.status}`);
    else fail(path, `HTTP ${response.status}; expected content missing`);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : String(error));
  }
}

async function checkPng(path, expectedWidth, expectedHeight, expectedAlpha) {
  try {
    const buffer = await readFile(resolve(root, path));
    const signature = buffer.subarray(0, 8).toString("hex");
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const colorType = buffer[25];
    const hasAlpha = colorType === 4 || colorType === 6 || hasPngChunk(buffer, "tRNS");
    const valid =
      signature === "89504e470d0a1a0a" &&
      width === expectedWidth &&
      height === expectedHeight &&
      hasAlpha === expectedAlpha;

    if (valid) pass(path, `${width}x${height} PNG; ${hasAlpha ? "transparent" : "opaque"}`);
    else {
      fail(
        path,
        `expected ${expectedWidth}x${expectedHeight} ${expectedAlpha ? "transparent" : "opaque"} PNG; found ${width}x${height} ${hasAlpha ? "transparent" : "opaque"}`
      );
    }
  } catch (error) {
    fail(path, error instanceof Error ? error.message : String(error));
  }
}

function hasPngChunk(buffer, expectedType) {
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === expectedType) return true;
    offset += 12 + length;
  }

  return false;
}

const appConfig = await readJson("apps/mobile/app.json");
const easConfig = await readJson("apps/mobile/eas.json");
const expo = appConfig.expo ?? {};

if (expo.name === "Deuces Arena" && expo.slug === "deuces-arena") {
  pass("app identity", `${expo.name} / ${expo.slug}`);
} else {
  fail("app identity", "name or slug does not match the release listing");
}

if (expo.ios?.bundleIdentifier === expectedBundleId && expo.android?.package === expectedBundleId) {
  pass("native identifiers", expectedBundleId);
} else {
  fail("native identifiers", "iOS bundle ID and Android package must remain stable");
}

if (expo.ios?.config?.usesNonExemptEncryption === false) {
  pass("iOS export compliance", "standard exempt encryption declared");
} else {
  fail("iOS export compliance", "usesNonExemptEncryption must remain explicitly false");
}

if (
  expo.scheme === "deucesarena" &&
  expo.ios?.associatedDomains?.includes("applinks:deucesarena.com")
) {
  pass("native links", "custom scheme and universal-link domain configured");
} else {
  fail("native links", "missing custom scheme or iOS associated domain");
}

const productionEnvironment = easConfig.build?.production?.env ?? {};
if (
  productionEnvironment.EXPO_PUBLIC_SERVER_URL === "https://api.deucesarena.com" &&
  productionEnvironment.EXPO_PUBLIC_WEB_URL === "https://deucesarena.com"
) {
  pass("production endpoints", "web and realtime custom domains configured");
} else {
  fail("production endpoints", "EAS production profile does not target the custom domains");
}

await checkPng("apps/mobile/assets/images/icon.png", 1024, 1024, false);
await checkPng("apps/mobile/assets/images/android-icon-foreground.png", 512, 512, true);
await checkPng("apps/mobile/assets/images/android-icon-background.png", 512, 512, false);
await checkPng("apps/mobile/assets/images/android-icon-monochrome.png", 432, 432, true);
await checkPng("apps/mobile/assets/images/splash-icon.png", 512, 512, true);
await checkPng("apps/mobile/assets/images/favicon.png", 48, 48, false);
await checkPng("apps/web/src/app/icon.png", 512, 512, false);
await checkPng("apps/web/src/app/apple-icon.png", 180, 180, false);
await checkPng("apps/web/src/app/opengraph-image.png", 1200, 630, false);
if (!offline) {
  await checkPage("/privacy", "Privacy Policy");
  await checkPage("/terms", "Terms of Service");
  await checkPage("/mobile-connect", "Connect the mobile app");

  try {
    const response = await fetchWithWakeup(new URL("/health", serverUrl));
    const health = await response.json();
    if (response.ok && health.ok === true && health.config?.database === "configured") {
      pass("realtime API", `HTTP ${response.status}; PostgreSQL configured`);
    } else {
      fail("realtime API", `HTTP ${response.status}; unhealthy or database missing`);
    }

    if (health.config?.pushNotifications === "enabled") {
      pass("push delivery", "enabled after device verification");
    } else {
      warn("push delivery", "disabled until a signed physical-device test succeeds");
    }
  } catch (error) {
    fail("realtime API", error instanceof Error ? error.message : String(error));
  }

  try {
    const response = await fetchWithWakeup(
      new URL("/.well-known/apple-app-site-association", webUrl)
    );
    const association = await response.json();
    const details = association?.applinks?.details;
    if (response.ok && Array.isArray(details) && details.length > 0) {
      pass("Apple universal links", details[0]?.appID ?? "configured");
    } else {
      warn("Apple universal links", "waiting for the Apple Team ID from signed EAS credentials");
    }
  } catch (error) {
    fail("Apple universal links", error instanceof Error ? error.message : String(error));
  }

  try {
    const response = await fetchWithWakeup(new URL("/.well-known/assetlinks.json", webUrl));
    const associations = await response.json();
    if (response.ok && Array.isArray(associations) && associations.length > 0) {
      pass("Android app links", associations[0]?.target?.package_name ?? "configured");
    } else {
      warn("Android app links", "waiting for the SHA-256 fingerprint from signed EAS credentials");
    }
  } catch (error) {
    fail("Android app links", error instanceof Error ? error.message : String(error));
  }
}

const failures = results.filter((result) => result.level === "FAIL");
const warnings = results.filter((result) => result.level === "WARN");
const passes = results.filter((result) => result.level === "PASS");

console.log(
  `\n${passes.length} passed, ${warnings.length} owner warning${warnings.length === 1 ? "" : "s"}, ${failures.length} failed.`
);

if (failures.length > 0 || (strict && warnings.length > 0)) process.exitCode = 1;

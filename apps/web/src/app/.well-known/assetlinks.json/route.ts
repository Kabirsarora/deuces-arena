const ANDROID_PACKAGE_NAME = "com.deucesarena.app";
const FINGERPRINT_PATTERN = /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter((fingerprint) => FINGERPRINT_PATTERN.test(fingerprint));
  const associations =
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: ANDROID_PACKAGE_NAME,
              sha256_cert_fingerprints: fingerprints
            }
          }
        ];

  return Response.json(associations, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json"
    }
  });
}

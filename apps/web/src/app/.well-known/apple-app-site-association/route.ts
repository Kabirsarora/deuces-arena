const APP_BUNDLE_ID = "com.deucesarena.app";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const details =
    teamId !== undefined && /^[A-Z0-9]{10}$/.test(teamId)
      ? [{ appID: `${teamId}.${APP_BUNDLE_ID}`, paths: ["/join/*"] }]
      : [];

  return Response.json(
    { applinks: { apps: [], details } },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json"
      }
    }
  );
}

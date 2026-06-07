import { createHash } from "node:crypto";

export function createAuthProfileId(identifier: string): string {
  return `auth-${createHash("sha256").update(identifier.toLowerCase()).digest("hex").slice(0, 32)}`;
}

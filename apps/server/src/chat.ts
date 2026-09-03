import { Filter } from "bad-words";

const MAX_CHAT_MESSAGE_LENGTH = 240;
const profanityFilter = new Filter({ placeHolder: "*" });
const OBFUSCATED_PROFANITY_PATTERNS = [
  /\bf[\W_]*u[\W_]*c[\W_]*k(?:ing|ed|er|s)?\b/gi,
  /\bs[\W_]*h[\W_]*[i1!][\W_]*t(?:ty|s)?\b/gi,
  /\bb[\W_]*[i1!][\W_]*t[\W_]*c[\W_]*h(?:es|y)?\b/gi,
  /\ba[\W_]*s[\W_]*s[\W_]*h[\W_]*o[\W_]*l[\W_]*e(?:s)?\b/gi
] as const;

const HARMFUL_COMMUNITY_PATTERNS = [
  /\bk[\W_]*[i1!][\W_]*l[\W_]*l\s+(?:yourself|urself)\b/i,
  /\bk[\W_]*y[\W_]*s\b/i,
  /\b(?:i(?:'ll|\s+will|\s+am\s+going\s+to)|we(?:'ll|\s+will))\s+(?:kill|hurt|shoot|stab)\s+you\b/i,
  /\br[\W_]*a[\W_]*p[\W_]*e\s+you\b/i,
  /\bn[\W_]*[i1!][\W_]*g[\W_]*g[\W_]*(?:e|3)[\W_]*r(?:s)?\b/i,
  /\bf[\W_]*a[\W_]*g(?:g[\W_]*o[\W_]*t)?(?:s)?\b/i,
  /\bc[\W_]*h[\W_]*[i1!][\W_]*n[\W_]*k(?:s)?\b/i,
  /\bk[\W_]*[i1!][\W_]*k[\W_]*e(?:s)?\b/i,
  /\bs[\W_]*p[\W_]*[i1!][\W_]*c(?:s)?\b/i,
  /\bw[\W_]*(?:e|3)[\W_]*t[\W_]*b[\W_]*a[\W_]*c[\W_]*k(?:s)?\b/i
] as const;

export type CommunityTextModerationResult =
  | { readonly accepted: true; readonly body: string }
  | { readonly accepted: false };

export function sanitizeChatMessage(body: string): string | null {
  const trimmed = body.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);

  if (trimmed === "") {
    return null;
  }

  const deobfuscated = OBFUSCATED_PROFANITY_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, "****"),
    trimmed
  );

  return profanityFilter.clean(deobfuscated);
}

export function moderateCommunityText(body: string): CommunityTextModerationResult {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (HARMFUL_COMMUNITY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { accepted: false };
  }

  const sanitized = sanitizeChatMessage(normalized);
  return sanitized === null ? { accepted: false } : { accepted: true, body: sanitized };
}

import { Filter } from "bad-words";

const MAX_CHAT_MESSAGE_LENGTH = 240;
const profanityFilter = new Filter({ placeHolder: "*" });
const OBFUSCATED_PROFANITY_PATTERNS = [
  /\bf[\W_]*u[\W_]*c[\W_]*k(?:ing|ed|er|s)?\b/gi,
  /\bs[\W_]*h[\W_]*[i1!][\W_]*t(?:ty|s)?\b/gi,
  /\bb[\W_]*[i1!][\W_]*t[\W_]*c[\W_]*h(?:es|y)?\b/gi,
  /\ba[\W_]*s[\W_]*s[\W_]*h[\W_]*o[\W_]*l[\W_]*e(?:s)?\b/gi
] as const;

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

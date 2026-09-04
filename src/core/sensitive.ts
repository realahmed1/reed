export type SensitiveTextKind = "access token" | "security code" | "password";

/**
 * A conservative guard for explicit clipboard and pasted-text requests.
 * Reed cannot infer the source application from clipboard text, so it blocks
 * recognizable secret shapes rather than attempting to read them aloud.
 */
export function detectLikelySensitiveText(value: string): SensitiveTextKind | null {
  const candidate = value.trim();

  if (/^\d{6}$/.test(candidate)) {
    return "security code";
}
  if (/(?:sk-|gh[pous]_|github_pat_|AKIA|xox[baprs]-|eyJ)[A-Za-z0-9_\-.=]{12,}/.test(candidate)) {
    return "access token";
  }

  const isSingleUnbrokenValue = !/\s/.test(candidate) && candidate.length >= 8 && candidate.length <= 128;
  const characterGroups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(candidate)).length;
  if (isSingleUnbrokenValue && characterGroups >= 3) {
    return "password";
  }

  return null;
}

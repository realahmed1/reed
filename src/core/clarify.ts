export const MAX_CLARIFICATION_CHARACTERS = 100;

export type ClarificationTermResult =
  | { ok: true; displayTerm: string; lookupTerm: string }
  | { ok: false; message: string };

/**
 * Limits an offline dictionary lookup to a short English word or phrase.
 * The selected text is transient and is never logged or persisted.
 */
export function prepareClarificationTerm(value: string): ClarificationTermResult {
  const displayTerm = value.replace(/\s+/g, " ").trim();

  if (!displayTerm) {
    return { ok: false, message: "Select a word or short phrase first." };
  }

  if (displayTerm.length > MAX_CLARIFICATION_CHARACTERS) {
    return { ok: false, message: "Choose a shorter word or phrase to clarify." };
  }

  if (!/^[A-Za-z][A-Za-z '\-]*$/.test(displayTerm)) {
    return { ok: false, message: "Reed’s offline dictionary currently supports English words and short phrases." };
  }

  return {
    ok: true,
    displayTerm,
    lookupTerm: displayTerm.toLowerCase().replace(/ /g, "_")
  };
}

/** Keeps the definition while dropping quoted examples that interrupt listening. */
export function conciseDefinition(glossary: string): string {
  const definition = glossary.split(";")[0]?.trim() ?? "";
  return definition.replace(/^\([^)]*\)\s*/, "").trim();
}


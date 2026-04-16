export function parseSourceMetadata(value?: string | null): Record<string, unknown> {
  if (!value?.trim()) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { legacyValue: parsed };
  } catch {
    return { legacyRawText: value };
  }
}

export function mergeSourceMetadata(
  existingValue: string | null | undefined,
  patch: Record<string, unknown>,
): string {
  const existing = parseSourceMetadata(existingValue);
  return JSON.stringify(
    {
      ...existing,
      ...patch,
    },
    null,
    2,
  );
}

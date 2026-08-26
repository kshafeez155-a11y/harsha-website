export function getUserFacingError(error: unknown, fallback: string): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You appear to be offline. Check your connection and try again.";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout")
  ) {
    return "Unable to connect right now. Check your connection and try again.";
  }

  return fallback;
}

export function getSupabaseOperationError(error: unknown, operation: string): string {
  return getUserFacingError(error, `Unable to ${operation} right now. Please try again.`);
}

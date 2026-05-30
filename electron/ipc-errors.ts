const genericUserMessage = "Operation Failed";

export function toIpcSafeError(error: unknown): Error {
  const issueMessage = getZodLikeIssueMessage(error);

  if (issueMessage) {
    return new Error(issueMessage);
  }

  if (error instanceof Error) {
    return new Error(toUserFacingIpcMessage(error.message));
  }

  return new Error(genericUserMessage);
}

export function normalizeIpcRendererError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(toUserFacingIpcMessage(error.message));
  }

  return new Error(genericUserMessage);
}

export function toUserFacingIpcMessage(rawMessage: string): string {
  const issueMessage = extractIssueMessage(rawMessage);

  if (issueMessage) {
    return issueMessage;
  }

  const message = stripErrorWrappers(rawMessage);

  if (!message || isTechnicalIpcErrorMessage(message)) {
    return genericUserMessage;
  }

  return message;
}

function stripErrorWrappers(rawMessage: string): string {
  let message = rawMessage.trim();
  let changed = true;

  while (changed) {
    const previous = message;
    message = message
      .replace(/^Error invoking remote method '[^']+':\s*/, "")
      .replace(/^Uncaught \(in promise\)\s*/, "")
      .replace(/^Error:\s*/, "")
      .replace(/^TypeError:\s*/, "")
      .trim();
    changed = message !== previous;
  }

  return message;
}

function extractIssueMessage(rawMessage: string): string | null {
  const message = stripErrorWrappers(rawMessage);
  const parsedMessage = parseJsonIssueMessage(message);

  if (parsedMessage) {
    return parsedMessage;
  }

  const match = /"message"\s*:\s*"([^"]+)"/.exec(message);
  return match?.[1] ?? null;
}

function parseJsonIssueMessage(message: string): string | null {
  try {
    return findMessage(JSON.parse(message));
  } catch {
    return null;
  }
}

function findMessage(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = findMessage(item);

      if (message) {
        return message;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message === "string" && value.message.trim()) {
    return value.message.trim();
  }

  for (const key of ["errors", "issues"]) {
    const message = findMessage(value[key]);

    if (message) {
      return message;
    }
  }

  return null;
}

function getZodLikeIssueMessage(error: unknown): string | null {
  if (!isRecord(error) || !Array.isArray(error.issues)) {
    return null;
  }

  return findMessage(error.issues) ?? "Check the entered details.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTechnicalIpcErrorMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  return (
    message.includes("Error invoking remote method") ||
    message.includes("ZodError") ||
    message.includes('"origin"') ||
    message.includes('"code"') ||
    message.includes('"path"') ||
    message.includes("\n    at ") ||
    lowerMessage.includes("cannot read properties of") ||
    lowerMessage.includes("is not a function") ||
    lowerMessage.includes("sqlite_") ||
    lowerMessage.includes("constraint failed")
  );
}

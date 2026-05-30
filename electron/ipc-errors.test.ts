import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  normalizeIpcRendererError,
  toIpcSafeError,
  toUserFacingIpcMessage,
} from "./ipc-errors";

describe("IPC error messages", () => {
  it("strips Electron invoke wrappers from plain errors", () => {
    const error = normalizeIpcRendererError(
      new Error("Error invoking remote method 'auth:login': Error: PIN is required."),
    );

    expect(error.message).toBe("PIN is required.");
  });

  it("extracts the first validation issue from a wrapped Zod payload", () => {
    const message = toUserFacingIpcMessage(
      "Error invoking remote method 'auth:login': [{\"origin\":\"string\",\"code\":\"too_small\",\"path\":[\"password\"],\"message\":\"PIN is required.\"}]",
    );

    expect(message).toBe("PIN is required.");
  });

  it("converts main-process Zod errors to their first plain validation message", () => {
    const result = z
      .object({ password: z.string().min(1, "PIN is required.") })
      .safeParse({ password: "" });

    if (result.success) {
      throw new Error("Expected schema validation to fail.");
    }

    expect(toIpcSafeError(result.error).message).toBe("PIN is required.");
  });

  it("hides internal runtime details behind a generic message", () => {
    const message = toUserFacingIpcMessage(
      "Error invoking remote method 'rentals:return': TypeError: Cannot read properties of undefined (reading 'id')",
    );

    expect(message).toBe("Operation Failed");
  });
});

import { describe, expect, it, vi } from "vitest";
import { executeWithGeminiFallback } from "../src/gemini/resilience.js";

describe("executeWithGeminiFallback", () => {
  it("returns primary result and records success on happy path", async () => {
    const primary = vi.fn().mockResolvedValue("gemini");
    const fallback = vi.fn();
    const result = await executeWithGeminiFallback("test", primary, fallback, "local");
    expect(result).toBe("gemini");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when primary throws", async () => {
    const primary = vi.fn().mockRejectedValue(new Error("503 unavailable"));
    const fallback = vi.fn().mockResolvedValue("local");
    const result = await executeWithGeminiFallback("test", primary, fallback, "local");
    expect(result).toBe("local");
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });
});

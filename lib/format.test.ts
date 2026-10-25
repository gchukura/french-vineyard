import { describe, expect, it } from "vitest";

import { formatCount, formatEur, parseSheetDate } from "@/lib/format";

describe("formatEur", () => {
  it("formats whole euros", () => {
    expect(formatEur(59)).toBe("€59");
    expect(formatEur(1250)).toBe("€1,250");
  });
});

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(1204)).toBe("1,204");
  });
});

describe("parseSheetDate", () => {
  it("returns ISO and a long English label", () => {
    expect(parseSheetDate("2026-10-24")).toEqual({ iso: "2026-10-24", label: "24 October 2026" });
  });

  it("ignores a trailing time", () => {
    expect(parseSheetDate("2026-03-01 09:30")?.iso).toBe("2026-03-01");
  });

  it("rejects text and impossible dates", () => {
    expect(parseSheetDate("last week")).toBeNull();
    expect(parseSheetDate("2026-02-31")).toBeNull();
  });
});

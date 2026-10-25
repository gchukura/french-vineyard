import { describe, expect, it } from "vitest";

import { isNoindex } from "@/lib/noindex";

describe("isNoindex", () => {
  it("is on when unset or set to anything but an explicit off", () => {
    for (const v of [undefined, "", "1", "true", "on", "yes"]) expect(isNoindex(v)).toBe(true);
  });

  it("is off only for 0, false, off and no", () => {
    for (const v of ["0", "false", "OFF", " no "]) expect(isNoindex(v)).toBe(false);
  });
});

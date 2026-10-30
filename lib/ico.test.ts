import { describe, expect, it } from "vitest";

import { encodeIco } from "@/lib/ico.mts";

describe("encodeIco", () => {
  it("writes a header, one directory entry per frame, then the PNG data", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const ico = encodeIco([
      { size: 16, png: a },
      { size: 32, png: b },
    ]);
    const view = new DataView(ico.buffer);

    expect(ico.length).toBe(6 + 16 * 2 + 5);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(2);

    expect(ico[6]).toBe(16);
    expect(ico[7]).toBe(16);
    expect(view.getUint16(6 + 6, true)).toBe(32);
    expect(view.getUint32(6 + 8, true)).toBe(3);
    expect(view.getUint32(6 + 12, true)).toBe(38);

    expect(ico[22]).toBe(32);
    expect(view.getUint32(22 + 8, true)).toBe(2);
    expect(view.getUint32(22 + 12, true)).toBe(41);

    expect([...ico.slice(38)]).toEqual([1, 2, 3, 4, 5]);
  });

  it("stores 256 px frames as 0", () => {
    const ico = encodeIco([{ size: 256, png: new Uint8Array([9]) }]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });

  it("rejects empty input and oversized frames", () => {
    expect(() => encodeIco([])).toThrow();
    expect(() => encodeIco([{ size: 512, png: new Uint8Array([1]) }])).toThrow();
  });
});

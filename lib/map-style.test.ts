import { describe, expect, it } from "vitest";

import { OPENFREEMAP_TILES, mutedMapStyle } from "@/lib/map-style";

describe("mutedMapStyle", () => {
  it("reads OpenFreeMap tiles with attribution", () => {
    const style = mutedMapStyle();
    const source = style.sources.openmaptiles;
    expect(source).toMatchObject({ type: "vector", url: OPENFREEMAP_TILES });
    expect("attribution" in source && source.attribution).toMatch(/OpenStreetMap/);
  });

  it("swaps the background for dark mode", () => {
    const bg = (theme: "light" | "dark") =>
      mutedMapStyle(theme).layers.find((l) => l.id === "background");
    expect(bg("light")).toMatchObject({ paint: { "background-color": "#f7f3ec" } });
    expect(bg("dark")).toMatchObject({ paint: { "background-color": "#1a1512" } });
  });

  it("has unique layer ids", () => {
    const ids = mutedMapStyle().layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

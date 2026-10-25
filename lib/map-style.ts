import type { MapOptions } from "maplibre-gl";

/**
 * A muted MapLibre style over OpenFreeMap's OpenMapTiles vector tiles, in the
 * site palette. Vineyards get a faint vine tint so wine country reads at a
 * glance; everything else stays quiet so the pins carry the map.
 */

export type MapStyle = Exclude<MapOptions["style"], string | undefined>;
export type MapTheme = "light" | "dark";

export const OPENFREEMAP_TILES = "https://tiles.openfreemap.org/planet";
export const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const PALETTES = {
  light: {
    land: "#f7f3ec",
    water: "#d6dcdc",
    green: "#e6e4d2",
    vineyard: "#dfe2c8",
    urban: "#ede6da",
    road: "#ffffff",
    roadMajor: "#e8dccb",
    boundary: "#b5a89c",
    label: "#6b5e54",
    labelHalo: "#f7f3ec",
  },
  dark: {
    land: "#1a1512",
    water: "#262c2e",
    green: "#211e17",
    vineyard: "#252719",
    urban: "#221c18",
    road: "#2f2723",
    roadMajor: "#3a302a",
    boundary: "#6b5e54",
    label: "#b5a89c",
    labelHalo: "#1a1512",
  },
} as const;

export function mutedMapStyle(theme: MapTheme = "light"): MapStyle {
  const c = PALETTES[theme];
  const font = ["Noto Sans Regular"];
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      openmaptiles: { type: "vector", url: OPENFREEMAP_TILES, attribution: MAP_ATTRIBUTION },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": c.land } },
      {
        id: "landcover",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "wetland"]]],
        paint: { "fill-color": c.green },
      },
      {
        id: "vineyard",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["==", ["get", "subclass"], "vineyard"],
        paint: { "fill-color": c.vineyard },
      },
      {
        id: "urban",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood"]]],
        paint: { "fill-color": c.urban },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": c.water },
      },
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        filter: ["in", ["get", "class"], ["literal", ["river", "canal"]]],
        paint: {
          "line-color": c.water,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 14, 4],
        },
      },
      {
        id: "boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": c.boundary, "line-width": 0.8, "line-dasharray": [3, 2] },
      },
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["tertiary", "minor", "service"]]],
        paint: {
          "line-color": c.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 16, 4],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary", "secondary"]],
        ],
        paint: {
          "line-color": c.roadMajor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 14, 5],
        },
      },
      {
        id: "place",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": font,
          "text-size": ["match", ["get", "class"], "city", 14, "town", 12, 11],
        },
        paint: { "text-color": c.label, "text-halo-color": c.labelHalo, "text-halo-width": 1.2 },
      },
    ],
  };
}

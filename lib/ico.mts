/**
 * Minimal .ico writer: packs square PNG frames into one file (PNG-in-ICO,
 * supported by every current browser). Used by scripts/brand-assets.mts.
 */

export type IcoFrame = { size: number; png: Uint8Array };

const HEADER = 6;
const ENTRY = 16;

export function encodeIco(frames: IcoFrame[]): Uint8Array {
  if (!frames.length) throw new Error("An .ico needs at least one frame");
  const total = HEADER + ENTRY * frames.length + frames.reduce((n, f) => n + f.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, frames.length, true);

  let offset = HEADER + ENTRY * frames.length;
  frames.forEach(({ size, png }, i) => {
    if (size < 1 || size > 256) throw new Error(`Icon frame size out of range: ${size}`);
    const at = HEADER + ENTRY * i;
    view.setUint8(at, size === 256 ? 0 : size); // width (0 means 256)
    view.setUint8(at + 1, size === 256 ? 0 : size); // height
    view.setUint8(at + 2, 0); // palette colours
    view.setUint8(at + 3, 0); // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, png.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

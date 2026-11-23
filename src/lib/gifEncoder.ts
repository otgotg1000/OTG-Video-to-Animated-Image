import { applyPalette, GIFEncoder, quantize } from 'gifenc';

/**
 * Checks whether any pixel in an RGBA buffer uses alpha < 255.
 */
function hasTransparentPixels(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 250) {
      return true;
    }
  }
  return false;
}

/**
 * Encodes an array of RGBA frames into a GIF89a binary byte array using gifenc.
 * Supports adaptive 32-256 color palettes, 1-bit alpha transparency, per-frame delays,
 * and Netscape loop repeat counts.
 */
export function encodeGif(
  rgbaBuffers: ArrayBuffer[],
  width: number,
  height: number,
  delaysMs: number[],
  quality: number,
  loopCount = 0
): Uint8Array {
  if (rgbaBuffers.length === 0) {
    throw new Error('Cannot encode GIF without frames.');
  }

  const maxColors = Math.max(24, Math.min(256, Math.round(24 + (quality / 100) * 232)));
  // GIF Netscape loop extension: 0 = infinite, -1 = play once (omit ext), >0 = extra repeats
  const repeat = loopCount === 0 ? 0 : loopCount === 1 ? -1 : loopCount - 1;

  const gif = GIFEncoder();

  for (let i = 0; i < rgbaBuffers.length; i++) {
    const rgba = new Uint8Array(rgbaBuffers[i]);
    const hasAlpha = hasTransparentPixels(rgba);
    const quantFormat = hasAlpha ? 'rgba4444' : 'rgb565';

    const palette = quantize(rgba, maxColors, {
      format: quantFormat,
      oneBitAlpha: hasAlpha,
      clearAlpha: hasAlpha,
      clearAlphaThreshold: 127,
    });

    const indexed = applyPalette(rgba, palette, quantFormat);
    const transparentIndex = hasAlpha
      ? palette.findIndex((entry) => entry.length >= 4 && entry[3] === 0)
      : -1;
    const isTransparent = hasAlpha && transparentIndex >= 0;

    gif.writeFrame(indexed, width, height, {
      palette,
      delay: Math.max(20, Math.round(delaysMs[i] ?? 42)),
      repeat,
      transparent: isTransparent,
      transparentIndex: isTransparent ? transparentIndex : 0,
      dispose: isTransparent ? 2 : 0,
    });
  }

  gif.finish();
  return gif.bytes();
}

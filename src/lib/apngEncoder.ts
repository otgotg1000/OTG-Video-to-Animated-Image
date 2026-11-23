import UPNG from 'upng-js';

// Precomputed CRC-32 lookup table per PNG specification
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Patches the `num_plays` field inside the PNG `acTL` chunk so APNG respects exact loop counts
 * (0 = infinite, 1..N = finite plays) and recalculates the chunk's CRC-32 checksum.
 */
function patchApngLoopCount(pngBuffer: ArrayBuffer, loopCount: number): Uint8Array {
  const bytes = new Uint8Array(pngBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const clampedLoops = Math.max(0, Math.min(0xffffffff, Math.round(loopCount)));

  let offset = 8; // Skip 8-byte PNG signature
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (type === 'acTL' && length === 8 && offset + 12 + length <= bytes.length) {
      // acTL data: [num_frames (4B BE), num_plays (4B BE)]
      view.setUint32(offset + 12, clampedLoops, false);
      const crcInput = bytes.subarray(offset + 4, offset + 8 + length);
      const updatedCrc = crc32(crcInput);
      view.setUint32(offset + 8 + length, updatedCrc, false);
      break;
    }

    offset += 12 + length;
  }

  return bytes;
}

export function encodeApng(
  rgbaFrames: ArrayBuffer[],
  width: number,
  height: number,
  delaysMs: number[],
  quality: number,
  loopCount: number
): Uint8Array {
  if (rgbaFrames.length === 0) {
    throw new Error('At least one frame is required to encode an APNG.');
  }

  // Quality 100 = lossless 32-bit RGBA (cnum = 0).
  // Quality 1..99 = adaptive palette quantization (16..256 colors) for compact APNG file sizes.
  const cnum =
    quality >= 100
      ? 0
      : Math.max(16, Math.min(256, Math.round(16 + (quality / 99) * 240)));

  const encoded = UPNG.encode(rgbaFrames, width, height, cnum, delaysMs);
  return patchApngLoopCount(encoded, loopCount);
}

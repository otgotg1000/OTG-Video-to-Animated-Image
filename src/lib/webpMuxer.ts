export interface WebpFrameInput {
  webpBuffer: ArrayBuffer;
  durationMs: number;
}

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

function writeFourCC(target: Uint8Array, offset: number, fourcc: string): void {
  target[offset] = fourcc.charCodeAt(0);
  target[offset + 1] = fourcc.charCodeAt(1);
  target[offset + 2] = fourcc.charCodeAt(2);
  target[offset + 3] = fourcc.charCodeAt(3);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function writeUint24LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
}

function writeUint16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

interface ExtractedFrameChunks {
  subChunks: Uint8Array[];
  hasAlpha: boolean;
}

function extractFrameImageChunks(buffer: ArrayBuffer): ExtractedFrameChunks {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || readFourCC(bytes, 0) !== 'RIFF' || readFourCC(bytes, 8) !== 'WEBP') {
    throw new Error(
      'This browser could not encode a WebP frame natively. Try switching output format to APNG or using Chrome/Firefox/Edge.'
    );
  }

  const subChunks: Uint8Array[] = [];
  let hasAlpha = false;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const fourcc = readFourCC(bytes, offset);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const paddedDataSize = chunkSize + (chunkSize & 1);
    const chunkEnd = offset + 8 + chunkSize;

    if (chunkEnd > bytes.length) {
      break;
    }

    if (fourcc === 'ALPH' || fourcc === 'VP8 ' || fourcc === 'VP8L') {
      if (fourcc === 'ALPH' || fourcc === 'VP8L') {
        hasAlpha = true;
      }
      // Copy chunk header (8 bytes) + payload + 1 padding byte if odd
      const block = new Uint8Array(8 + paddedDataSize);
      block.set(bytes.subarray(offset, chunkEnd), 0);
      subChunks.push(block);
    }

    offset += 8 + paddedDataSize;
  }

  if (subChunks.length === 0) {
    throw new Error('Failed to extract VP8/VP8L frame payload from encoded WebP buffer.');
  }

  return { subChunks, hasAlpha };
}

export function muxAnimatedWebp(
  frames: WebpFrameInput[],
  width: number,
  height: number,
  loopCount: number
): Uint8Array {
  if (frames.length === 0) {
    throw new Error('At least one frame is required to build an Animated WebP.');
  }

  const extractedFrames = frames.map((f) => ({
    ...extractFrameImageChunks(f.webpBuffer),
    durationMs: Math.max(1, Math.min(0xffffff, Math.round(f.durationMs))),
  }));

  const anyAlpha = extractedFrames.some((f) => f.hasAlpha);

  // 1. VP8X Chunk (8 header + 10 payload = 18 bytes)
  const vp8xChunk = new Uint8Array(18);
  writeFourCC(vp8xChunk, 0, 'VP8X');
  writeUint32LE(vp8xChunk, 4, 10);
  const vp8xFlags = 0x02 | (anyAlpha ? 0x10 : 0x00); // Bit 1 = Animation, Bit 4 = Alpha
  writeUint32LE(vp8xChunk, 8, vp8xFlags);
  writeUint24LE(vp8xChunk, 12, width - 1);
  writeUint24LE(vp8xChunk, 15, height - 1);

  // 2. ANIM Chunk (8 header + 6 payload = 14 bytes)
  const animChunk = new Uint8Array(14);
  writeFourCC(animChunk, 0, 'ANIM');
  writeUint32LE(animChunk, 4, 6);
  writeUint32LE(animChunk, 8, 0x00000000); // BGRA canvas clear color
  writeUint16LE(animChunk, 12, Math.max(0, Math.min(65535, Math.round(loopCount))));

  // 3. ANMF Chunks
  const anmfChunks: Uint8Array[] = [];
  let anmfTotalSize = 0;

  for (const frame of extractedFrames) {
    let subChunksSize = 0;
    for (const sc of frame.subChunks) {
      subChunksSize += sc.length;
    }

    const payloadSize = 16 + subChunksSize;
    const paddedPayloadSize = payloadSize + (payloadSize & 1);
    const anmf = new Uint8Array(8 + paddedPayloadSize);

    writeFourCC(anmf, 0, 'ANMF');
    writeUint32LE(anmf, 4, payloadSize);
    writeUint24LE(anmf, 8, 0); // Frame X
    writeUint24LE(anmf, 11, 0); // Frame Y
    writeUint24LE(anmf, 14, width - 1);
    writeUint24LE(anmf, 17, height - 1);
    writeUint24LE(anmf, 20, frame.durationMs);
    anmf[23] = 0x03; // Blending=1 (do not blend/overwrite), Disposal=1 (dispose to transparent background)

    let cursor = 24;
    for (const sc of frame.subChunks) {
      anmf.set(sc, cursor);
      cursor += sc.length;
    }

    anmfChunks.push(anmf);
    anmfTotalSize += anmf.length;
  }

  // 4. Assemble RIFF Container
  const riffPayloadSize = 4 + vp8xChunk.length + animChunk.length + anmfTotalSize;
  const output = new Uint8Array(8 + riffPayloadSize);

  writeFourCC(output, 0, 'RIFF');
  writeUint32LE(output, 4, riffPayloadSize);
  writeFourCC(output, 8, 'WEBP');

  let pos = 12;
  output.set(vp8xChunk, pos);
  pos += vp8xChunk.length;

  output.set(animChunk, pos);
  pos += animChunk.length;

  for (const anmf of anmfChunks) {
    output.set(anmf, pos);
    pos += anmf.length;
  }

  return output;
}

export async function isNativeWebpEncodingSupported(): Promise<boolean> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.8)
    );
    if (!blob) return false;
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return (
      bytes.length >= 12 &&
      readFourCC(bytes, 0) === 'RIFF' &&
      readFourCC(bytes, 8) === 'WEBP'
    );
  } catch {
    return false;
  }
}

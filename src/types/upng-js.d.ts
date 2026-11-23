declare module 'upng-js' {
  export interface UPNGImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: Array<{
      rect: { x: number; y: number; width: number; height: number };
      delay: number;
    }>;
    tabs: Record<string, unknown>;
    data: ArrayBuffer;
  }

  export function decode(buffer: ArrayBuffer): UPNGImage;
  export function encode(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cnum: number,
    dels?: number[]
  ): ArrayBuffer;
  export function encodeLL(
    imgs: ArrayBuffer[],
    w: number,
    h: number,
    cc: number,
    bc: number,
    ac: number,
    dels?: number[]
  ): ArrayBuffer;
  export function toRGBA8(out: UPNGImage): ArrayBuffer[];
}

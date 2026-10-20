declare module "utif" {
  type TiffIfd = {
    width?: number;
    height?: number;
  };

  type UtifApi = {
    decode: (buffer: ArrayBuffer) => TiffIfd[];
    decodeImage: (buffer: ArrayBuffer, ifd: TiffIfd) => void;
    toRGBA8: (ifd: TiffIfd) => Uint8Array;
    encodeImage: (rgba: Uint8Array, width: number, height: number) => ArrayBuffer;
  };

  const UTIF: UtifApi;
  export default UTIF;
}

const PHOTO_RESTART_MCUS = 126;
const QUALITY = 85;

const ZIGZAG = [
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41,
  43, 9, 11, 18, 24, 31, 40, 44, 53, 10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46,
  51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63,
];

const Y_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40,
  57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35,
  55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112,
  100, 103, 99,
];

const UV_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99,
  99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

const DC_LUM_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUM_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUM_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUM_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51,
  0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1,
  0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57,
  0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92,
  0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8,
  0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2,
  0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const DC_CHR_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHR_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_CHR_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHR_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07,
  0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09,
  0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25,
  0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38,
  0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56,
  0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74,
  0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba,
  0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6,
  0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2,
  0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

const AASF = [
  1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379,
];

type Huff = { code: Uint32Array; len: Uint8Array };

const buildHuff = (bits: number[], values: number[]): Huff => {
  const code = new Uint32Array(256);
  const len = new Uint8Array(256);
  let next = 0;
  let cursor = 0;
  for (let size = 1; size <= 16; size += 1) {
    const count = bits[size - 1] ?? 0;
    for (let index = 0; index < count; index += 1) {
      const symbol = values[cursor] ?? 0;
      code[symbol] = next;
      len[symbol] = size;
      cursor += 1;
      next += 1;
    }
    next <<= 1;
  }
  return { code, len };
};

const DC_LUM = buildHuff(DC_LUM_BITS, DC_LUM_VALS);
const AC_LUM = buildHuff(AC_LUM_BITS, AC_LUM_VALS);
const DC_CHR = buildHuff(DC_CHR_BITS, DC_CHR_VALS);
const AC_CHR = buildHuff(AC_CHR_BITS, AC_CHR_VALS);

const category = new Uint8Array(65536);
const extraBits = new Int32Array(65536);
const extraLen = new Uint8Array(65536);

const fillCategories = () => {
  let lower = 1;
  let upper = 2;
  for (let cat = 1; cat <= 15; cat += 1) {
    for (let value = lower; value < upper; value += 1) {
      category[32767 + value] = cat;
      extraBits[32767 + value] = value;
      extraLen[32767 + value] = cat;
    }
    for (let value = -(upper - 1); value <= -lower; value += 1) {
      category[32767 + value] = cat;
      extraBits[32767 + value] = upper - 1 + value;
      extraLen[32767 + value] = cat;
    }
    lower <<= 1;
    upper <<= 1;
  }
};
fillCategories();

const yuv = new Int32Array(2048);
for (let tone = 0; tone < 256; tone += 1) {
  yuv[tone] = 19595 * tone;
  yuv[tone + 256] = 38470 * tone;
  yuv[tone + 512] = 7471 * tone + 0x8000;
  yuv[tone + 768] = -11059 * tone;
  yuv[tone + 1024] = -21709 * tone;
  yuv[tone + 1280] = 32768 * tone + 0x807fff;
  yuv[tone + 1536] = -27439 * tone;
  yuv[tone + 1792] = -5329 * tone;
}

const yOf = (red: number, green: number, blue: number): number =>
  ((yuv[red] + yuv[green + 256] + yuv[blue + 512]) >> 16) - 128;

const uOf = (red: number, green: number, blue: number): number =>
  ((yuv[red + 768] + yuv[green + 1024] + yuv[blue + 1280]) >> 16) - 128;

const vOf = (red: number, green: number, blue: number): number =>
  ((yuv[red + 1280] + yuv[green + 1536] + yuv[blue + 1792]) >> 16) - 128;

const scaleQuant = (base: number[]): Int32Array => {
  const factor = QUALITY < 50 ? Math.floor(5000 / QUALITY) : Math.floor(200 - QUALITY * 2);
  const natural = new Int32Array(64);
  const zigzag = new Int32Array(64);
  for (let index = 0; index < 64; index += 1) {
    const value = Math.min(255, Math.max(1, Math.floor(((base[index] ?? 1) * factor + 50) / 100)));
    natural[index] = value;
    zigzag[ZIGZAG[index] ?? 0] = value;
  }
  return zigzag;
};

const fdtbl = (zigzagQuant: Int32Array): Float64Array => {
  const table = new Float64Array(64);
  let index = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const quant = zigzagQuant[ZIGZAG[index] ?? 0] ?? 1;
      table[index] = 1 / (quant * (AASF[row] ?? 1) * (AASF[col] ?? 1) * 8);
      index += 1;
    }
  }
  return table;
};

const Y_Q = scaleQuant(Y_QUANT);
const UV_Q = scaleQuant(UV_QUANT);
const Y_FD = fdtbl(Y_Q);
const UV_FD = fdtbl(UV_Q);

const dctQuant = (block: Float64Array, factors: Float64Array, into: Int16Array): void => {
  for (let row = 0; row < 8; row += 1) {
    const offset = row * 8;
    const d0 = block[offset] ?? 0;
    const d1 = block[offset + 1] ?? 0;
    const d2 = block[offset + 2] ?? 0;
    const d3 = block[offset + 3] ?? 0;
    const d4 = block[offset + 4] ?? 0;
    const d5 = block[offset + 5] ?? 0;
    const d6 = block[offset + 6] ?? 0;
    const d7 = block[offset + 7] ?? 0;
    const tmp0 = d0 + d7;
    const tmp7 = d0 - d7;
    const tmp1 = d1 + d6;
    const tmp6 = d1 - d6;
    const tmp2 = d2 + d5;
    const tmp5 = d2 - d5;
    const tmp3 = d3 + d4;
    const tmp4 = d3 - d4;
    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;
    block[offset] = tmp10 + tmp11;
    block[offset + 4] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * 0.707106781;
    block[offset + 2] = tmp13 + z1;
    block[offset + 6] = tmp13 - z1;
    const odd10 = tmp4 + tmp5;
    const odd11 = tmp5 + tmp6;
    const odd12 = tmp6 + tmp7;
    const z5 = (odd10 - odd12) * 0.382683433;
    const z2 = 0.5411961 * odd10 + z5;
    const z4 = 1.306562965 * odd12 + z5;
    const z3 = odd11 * 0.707106781;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    block[offset + 5] = z13 + z2;
    block[offset + 3] = z13 - z2;
    block[offset + 1] = z11 + z4;
    block[offset + 7] = z11 - z4;
  }

  for (let col = 0; col < 8; col += 1) {
    const d0 = block[col] ?? 0;
    const d1 = block[col + 8] ?? 0;
    const d2 = block[col + 16] ?? 0;
    const d3 = block[col + 24] ?? 0;
    const d4 = block[col + 32] ?? 0;
    const d5 = block[col + 40] ?? 0;
    const d6 = block[col + 48] ?? 0;
    const d7 = block[col + 56] ?? 0;
    const tmp0 = d0 + d7;
    const tmp7 = d0 - d7;
    const tmp1 = d1 + d6;
    const tmp6 = d1 - d6;
    const tmp2 = d2 + d5;
    const tmp5 = d2 - d5;
    const tmp3 = d3 + d4;
    const tmp4 = d3 - d4;
    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;
    block[col] = tmp10 + tmp11;
    block[col + 32] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * 0.707106781;
    block[col + 16] = tmp13 + z1;
    block[col + 48] = tmp13 - z1;
    const odd10 = tmp4 + tmp5;
    const odd11 = tmp5 + tmp6;
    const odd12 = tmp6 + tmp7;
    const z5 = (odd10 - odd12) * 0.382683433;
    const z2 = 0.5411961 * odd10 + z5;
    const z4 = 1.306562965 * odd12 + z5;
    const z3 = odd11 * 0.707106781;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    block[col + 40] = z13 + z2;
    block[col + 24] = z13 - z2;
    block[col + 8] = z11 + z4;
    block[col + 56] = z11 - z4;
  }

  for (let index = 0; index < 64; index += 1) {
    const value = (block[index] ?? 0) * (factors[index] ?? 1);
    into[index] = value > 0 ? (value + 0.5) | 0 : (value - 0.5) | 0;
  }
};

const zigzagOf = (natural: Int16Array): Int16Array => {
  const out = new Int16Array(64);
  for (let index = 0; index < 64; index += 1) {
    out[ZIGZAG[index] ?? 0] = natural[index] ?? 0;
  }
  return out;
};

const constantDu = (sample: number, factors: Float64Array): Int16Array => {
  const block = new Float64Array(64);
  block.fill(sample);
  const natural = new Int16Array(64);
  dctQuant(block, factors, natural);
  return zigzagOf(natural);
};

const WHITE_Y = constantDu(127, Y_FD);
const BLACK_Y = constantDu(-128, Y_FD);
const ZERO_UV = constantDu(0, UV_FD);

class BitWriter {
  private readonly bytes: number[] = [];
  private acc = 0;
  private bit = 7;

  writeByte(value: number): void {
    this.bytes.push(value & 255);
  }

  writeWord(value: number): void {
    this.writeByte(value >> 8);
    this.writeByte(value);
  }

  writeBits(value: number, length: number): void {
    let remaining = length - 1;
    while (remaining >= 0) {
      if (value & (1 << remaining)) this.acc |= 1 << this.bit;
      remaining -= 1;
      this.bit -= 1;
      if (this.bit < 0) {
        this.writeByte(this.acc);
        if (this.acc === 0xff) this.writeByte(0);
        this.bit = 7;
        this.acc = 0;
      }
    }
  }

  writeSymbol(table: Huff, symbol: number): void {
    this.writeBits(table.code[symbol] ?? 0, table.len[symbol] ?? 0);
  }

  pad(): void {
    if (this.bit === 7) return;
    const count = this.bit + 1;
    this.writeBits((1 << count) - 1, count);
  }

  restart(index: number): void {
    this.pad();
    this.writeByte(0xff);
    this.writeByte(0xd0 + (index & 7));
    this.acc = 0;
    this.bit = 7;
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const writeDu = (
  writer: BitWriter,
  du: Int16Array,
  previous: number,
  dc: Huff,
  ac: Huff,
): number => {
  const diff = (du[0] ?? 0) - previous;
  if (diff === 0) {
    writer.writeSymbol(dc, 0);
  } else {
    const slot = 32767 + diff;
    writer.writeSymbol(dc, category[slot] ?? 0);
    writer.writeBits(extraBits[slot] ?? 0, extraLen[slot] ?? 0);
  }

  let end = 63;
  while (end > 0 && du[end] === 0) end -= 1;
  if (end === 0) {
    writer.writeSymbol(ac, 0x00);
    return du[0] ?? 0;
  }

  let index = 1;
  while (index <= end) {
    const start = index;
    while (index <= end && du[index] === 0) index += 1;
    let zeros = index - start;
    if (zeros >= 16) {
      const runs = zeros >> 4;
      for (let run = 0; run < runs; run += 1) writer.writeSymbol(ac, 0xf0);
      zeros &= 0x0f;
    }
    const slot = 32767 + (du[index] ?? 0);
    writer.writeSymbol(ac, ((zeros << 4) + (category[slot] ?? 0)) & 255);
    writer.writeBits(extraBits[slot] ?? 0, extraLen[slot] ?? 0);
    index += 1;
  }
  if (end !== 63) writer.writeSymbol(ac, 0x00);
  return du[0] ?? 0;
};

const writeHeaders = (writer: BitWriter, width: number, height: number): void => {
  writer.writeWord(0xffd8);
  writer.writeWord(0xffe0);
  writer.writeWord(16);
  writer.writeByte(0x4a);
  writer.writeByte(0x46);
  writer.writeByte(0x49);
  writer.writeByte(0x46);
  writer.writeByte(0);
  writer.writeByte(1);
  writer.writeByte(2);
  writer.writeByte(1);
  writer.writeWord(72);
  writer.writeWord(72);
  writer.writeByte(0);
  writer.writeByte(0);
  writer.writeWord(0xffdb);
  writer.writeWord(132);
  writer.writeByte(0);
  for (let index = 0; index < 64; index += 1) writer.writeByte(Y_Q[index] ?? 1);
  writer.writeByte(1);
  for (let index = 0; index < 64; index += 1) writer.writeByte(UV_Q[index] ?? 1);
  writer.writeWord(0xffc0);
  writer.writeWord(17);
  writer.writeByte(8);
  writer.writeWord(height);
  writer.writeWord(width);
  writer.writeByte(3);
  writer.writeByte(1);
  writer.writeByte(0x22);
  writer.writeByte(0);
  writer.writeByte(2);
  writer.writeByte(0x11);
  writer.writeByte(1);
  writer.writeByte(3);
  writer.writeByte(0x11);
  writer.writeByte(1);
  writer.writeWord(0xffdd);
  writer.writeWord(4);
  writer.writeWord(PHOTO_RESTART_MCUS);
  writer.writeWord(0xffc4);
  writer.writeWord(0x01a2);
  const tables: Array<[number, number[], number[]]> = [
    [0x00, DC_LUM_BITS, DC_LUM_VALS],
    [0x10, AC_LUM_BITS, AC_LUM_VALS],
    [0x01, DC_CHR_BITS, DC_CHR_VALS],
    [0x11, AC_CHR_BITS, AC_CHR_VALS],
  ];
  for (const [id, bits, values] of tables) {
    writer.writeByte(id);
    for (const count of bits) writer.writeByte(count);
    for (const value of values) writer.writeByte(value);
  }
  writer.writeWord(0xffda);
  writer.writeWord(12);
  writer.writeByte(3);
  writer.writeByte(1);
  writer.writeByte(0x00);
  writer.writeByte(2);
  writer.writeByte(0x11);
  writer.writeByte(3);
  writer.writeByte(0x11);
  writer.writeByte(0);
  writer.writeByte(0x3f);
  writer.writeByte(0);
};

const sample = (
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number] => {
  const index = (y * width + x) * 4;
  return [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
};

export const encodeCameraJpeg = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array => {
  if (width < 16 || height < 16 || width % 16 !== 0 || height % 16 !== 0) {
    throw new Error("Кадр камеры должен делиться на 16.");
  }
  if (pixels.length < width * height * 4) {
    throw new Error("В кадре не хватает пикселей.");
  }

  const writer = new BitWriter();
  writeHeaders(writer, width, height);

  const block = new Float64Array(64);
  const chromaU = new Float64Array(64);
  const chromaV = new Float64Array(64);
  const natural = new Int16Array(64);
  const du = new Int16Array(64);
  let dcY = 0;
  let dcU = 0;
  let dcV = 0;
  let mcu = 0;
  let restart = 0;

  const emitDu = (coefficients: Int16Array, previous: number, dc: Huff, ac: Huff): number =>
    writeDu(writer, coefficients, previous, dc, ac);

  const emitSamples = (samples: Float64Array, factors: Float64Array, previous: number, dc: Huff, ac: Huff): number => {
    dctQuant(samples, factors, natural);
    for (let index = 0; index < 64; index += 1) du[ZIGZAG[index] ?? 0] = natural[index] ?? 0;
    return emitDu(du, previous, dc, ac);
  };

  for (let originY = 0; originY < height; originY += 16) {
    for (let originX = 0; originX < width; originX += 16) {
      if (mcu > 0 && mcu % PHOTO_RESTART_MCUS === 0) {
        writer.restart(restart);
        restart = (restart + 1) & 7;
        dcY = 0;
        dcU = 0;
        dcV = 0;
      }
      mcu += 1;

      const [firstRed, firstGreen, firstBlue] = sample(pixels, width, originX, originY);
      let uniform = true;
      for (let y = 0; y < 16 && uniform; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const [red, green, blue] = sample(pixels, width, originX + x, originY + y);
          if (red !== firstRed || green !== firstGreen || blue !== firstBlue) {
            uniform = false;
            break;
          }
        }
      }

      if (uniform && firstRed === 255 && firstGreen === 255 && firstBlue === 255) {
        dcY = emitDu(WHITE_Y, dcY, DC_LUM, AC_LUM);
        dcY = emitDu(WHITE_Y, dcY, DC_LUM, AC_LUM);
        dcY = emitDu(WHITE_Y, dcY, DC_LUM, AC_LUM);
        dcY = emitDu(WHITE_Y, dcY, DC_LUM, AC_LUM);
        dcU = emitDu(ZERO_UV, dcU, DC_CHR, AC_CHR);
        dcV = emitDu(ZERO_UV, dcV, DC_CHR, AC_CHR);
        continue;
      }
      if (uniform && firstRed === 0 && firstGreen === 0 && firstBlue === 0) {
        dcY = emitDu(BLACK_Y, dcY, DC_LUM, AC_LUM);
        dcY = emitDu(BLACK_Y, dcY, DC_LUM, AC_LUM);
        dcY = emitDu(BLACK_Y, dcY, DC_LUM, AC_LUM);
        dcY = emitDu(BLACK_Y, dcY, DC_LUM, AC_LUM);
        dcU = emitDu(ZERO_UV, dcU, DC_CHR, AC_CHR);
        dcV = emitDu(ZERO_UV, dcV, DC_CHR, AC_CHR);
        continue;
      }

      for (const [blockX, blockY] of [
        [0, 0],
        [8, 0],
        [0, 8],
        [8, 8],
      ] as const) {
        let cursor = 0;
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            const [red, green, blue] = sample(
              pixels,
              width,
              originX + blockX + x,
              originY + blockY + y,
            );
            block[cursor] = yOf(red, green, blue);
            cursor += 1;
          }
        }
        dcY = emitSamples(block, Y_FD, dcY, DC_LUM, AC_LUM);
      }

      let cursor = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          let u = 0;
          let v = 0;
          for (let dy = 0; dy < 2; dy += 1) {
            for (let dx = 0; dx < 2; dx += 1) {
              const [red, green, blue] = sample(
                pixels,
                width,
                originX + x * 2 + dx,
                originY + y * 2 + dy,
              );
              u += uOf(red, green, blue);
              v += vOf(red, green, blue);
            }
          }
          chromaU[cursor] = u / 4;
          chromaV[cursor] = v / 4;
          cursor += 1;
        }
      }
      dcU = emitSamples(chromaU, UV_FD, dcU, DC_CHR, AC_CHR);
      dcV = emitSamples(chromaV, UV_FD, dcV, DC_CHR, AC_CHR);
    }
  }

  writer.pad();
  writer.writeWord(0xffd9);
  return writer.finish();
};

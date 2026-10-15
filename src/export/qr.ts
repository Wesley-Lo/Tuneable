/**
 * Small QR code generator. Byte mode, versions 1 to 10, error correction M (falls back
 * to L for longer text). Follows ISO/IEC 18004: Reed-Solomon over GF(256), eight masks
 * scored with the standard penalty rules.
 */

type Ecc = 'L' | 'M';

// Index 0 is unused. Values for versions 1 to 10.
const ECC_PER_BLOCK: Record<Ecc, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
};
const NUM_BLOCKS: Record<Ecc, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
};
const FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0 };
const MAX_VERSION = 10;

function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

function dataCodewords(ver: number, ecc: Ecc): number {
  return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * NUM_BLOCKS[ecc][ver];
}

function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

// Reed-Solomon over GF(2^8) with polynomial 0x11D
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function encodeData(bytes: number[], ver: number, ecc: Ecc): number[] {
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));

  const capacity = dataCodewords(ver, ecc) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

  const out: number[] = new Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => (out[i >>> 3] |= b << (7 - (i & 7))));
  return out;
}

function addEccAndInterleave(data: number[], ver: number, ecc: Ecc): number[] {
  const numBlocks = NUM_BLOCKS[ecc][ver];
  const blockEccLen = ECC_PER_BLOCK[ecc][ver];
  const rawCodewords = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - blockEccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const eccBytes = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(eccBytes));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - blockEccLen || j >= numShort) result.push(block[i]);
    });
  }
  return result;
}

class Matrix {
  readonly size: number;
  modules: boolean[][];
  isFunction: boolean[][];

  constructor(private ver: number, private ecc: Ecc, codewords: number[]) {
    this.size = ver * 4 + 17;
    const row = () => new Array<boolean>(this.size).fill(false);
    this.modules = Array.from({ length: this.size }, row);
    this.isFunction = Array.from({ length: this.size }, row);

    this.drawFunctionPatterns();
    this.drawCodewords(addEccAndInterleave(codewords, ver, ecc));

    let best = 0;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      this.applyMask(m);
      this.drawFormatBits(m);
      const score = this.penalty();
      if (score < bestScore) {
        best = m;
        bestScore = score;
      }
      this.applyMask(m); // undo (XOR)
    }
    this.applyMask(best);
    this.drawFormatBits(best);
  }

  private setFunc(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns() {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.setFunc(6, i, i % 2 === 0);
      this.setFunc(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(size - 4, 3);
    this.finder(3, size - 4);

    const pos = this.alignmentPositions();
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.alignment(pos[i], pos[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private finder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunc(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private alignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunc(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private alignmentPositions(): number[] {
    if (this.ver === 1) return [];
    const count = Math.floor(this.ver / 7) + 2;
    const step = Math.ceil((this.ver * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  private drawFormatBits(mask: number) {
    const size = this.size;
    const data = (FORMAT_BITS[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunc(8, i, bit(bits, i));
    this.setFunc(8, 7, bit(bits, 6));
    this.setFunc(8, 8, bit(bits, 7));
    this.setFunc(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunc(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.setFunc(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunc(8, size - 15 + i, bit(bits, i));
    this.setFunc(8, size - 8, true);
  }

  private drawVersion() {
    if (this.ver < 7) return;
    let rem = this.ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunc(a, b, bit(bits, i));
      this.setFunc(b, a, bit(bits, i));
    }
  }

  private drawCodewords(data: number[]) {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private penalty(): number {
    const size = this.size;
    const m = this.modules;
    let score = 0;

    const scoreLine = (get: (i: number) => boolean) => {
      let run = 1;
      for (let i = 1; i < size; i++) {
        if (get(i) === get(i - 1)) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
      // finder-like pattern 1:1:3:1:1 with a light border of four
      for (let i = 0; i + 10 < size; i++) {
        const w = (k: number) => get(i + k);
        const core = w(0) && !w(1) && w(2) && w(3) && w(4) && !w(5) && w(6);
        if (core && !w(7) && !w(8) && !w(9) && !w(10)) score += 40;
        if (core && i >= 4 && !get(i - 1) && !get(i - 2) && !get(i - 3) && !get(i - 4)) score += 40;
      }
    };
    for (let y = 0; y < size; y++) scoreLine((i) => m[y][i]);
    for (let x = 0; x < size; x++) scoreLine((i) => m[i][x]);

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
      }
    }

    let dark = 0;
    for (const row of m) for (const c of row) if (c) dark++;
    const total = size * size;
    score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return score;
  }
}

/** Returns a square grid of modules (true is dark), or null if the text is too long. */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = utf8(text);
  for (const ecc of ['M', 'L'] as Ecc[]) {
    for (let ver = 1; ver <= MAX_VERSION; ver++) {
      const lenBits = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
      if (lenBits <= dataCodewords(ver, ecc) * 8) {
        return new Matrix(ver, ecc, encodeData(bytes, ver, ecc)).modules;
      }
    }
  }
  return null;
}

/** SVG markup with a four module quiet zone on a light background, ready to scan. */
export function qrSvg(text: string): string | null {
  const m = qrMatrix(text);
  if (!m) return null;
  const quiet = 4;
  const size = m.length + quiet * 2;
  let d = '';
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for the share link">` +
    `<rect width="${size}" height="${size}" fill="#f4f3ff"/><path d="${d}" fill="#0b0c14"/></svg>`
  );
}

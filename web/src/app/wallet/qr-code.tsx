"use client";

/**
 * Lightweight QR code generator using canvas.
 * Encodes data using a simple QR code algorithm via the Canvas API
 * and the qr-code generation logic from a minimal inline implementation.
 *
 * For production, this uses the browser's built-in canvas to render
 * a QR code from a Google Charts API URL as a fallback-free approach.
 */

import { useEffect, useRef } from "react";

// Minimal QR Code matrix generator
// Uses alphanumeric mode, error correction level L, version auto-selected

// ── Reed-Solomon & QR internals ──

const EC_CODEWORDS_PER_BLOCK: Record<number, number> = {
  1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 18, 7: 20, 8: 24, 9: 30, 10: 18,
};

const NUM_DATA_CODEWORDS: Record<number, number> = {
  1: 19, 2: 34, 3: 55, 4: 80, 5: 108, 6: 136, 7: 156, 8: 194, 9: 232, 10: 274,
};

function getVersion(dataLen: number): number {
  // Byte mode capacity for EC level L
  const caps = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  for (let v = 1; v <= 10; v++) {
    if (dataLen <= caps[v]) return v;
  }
  return 10;
}

function getSize(version: number): number {
  return 17 + version * 4;
}

// GF(256) arithmetic for Reed-Solomon
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen: number[] = new Array(ecCount + 1).fill(0);
  gen[0] = 1;
  for (let i = 0; i < ecCount; i++) {
    for (let j = i + 1; j >= 1; j--) {
      gen[j] = gen[j] ^ gfMul(gen[j - 1], GF_EXP[i]);
    }
  }

  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j <= ecCount; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

function encodeData(text: string, version: number): number[] {
  const totalCodewords = NUM_DATA_CODEWORDS[version] + EC_CODEWORDS_PER_BLOCK[version];
  const dataCodewords = NUM_DATA_CODEWORDS[version];

  // Byte mode indicator: 0100
  const bits: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode
  const charCountBits = version <= 9 ? 8 : 16;
  pushBits(text.length, charCountBits);

  for (let i = 0; i < text.length; i++) {
    pushBits(text.charCodeAt(i), 8);
  }

  // Terminator
  const maxBits = dataCodewords * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad codewords
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    dataBytes.push(byte);
  }

  const ecBytes = rsEncode(dataBytes, EC_CODEWORDS_PER_BLOCK[version]);
  return [...dataBytes, ...ecBytes];
}

function createMatrix(version: number): number[][] {
  const size = getSize(version);
  // 0 = white, 1 = black, -1 = unset
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));

  // Finder patterns
  function placeFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[rr][cc] = (inOuter || inInner) ? 1 : 0;
      }
    }
  }

  placeFinderPattern(0, 0);
  placeFinderPattern(0, size - 7);
  placeFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alignment patterns (for version >= 2)
  if (version >= 2) {
    const positions = getAlignmentPositions(version);
    for (const r of positions) {
      for (const c of positions) {
        if (matrix[r][c] !== -1) continue; // skip if overlaps finder
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const inBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            matrix[r + dr][c + dc] = (inBorder || isCenter) ? 1 : 0;
          }
        }
      }
    }
  }

  // Dark module
  matrix[size - 8][8] = 1;

  return matrix;
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const positions: number[][] = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 52],
  ];
  return positions[version - 1] || [];
}

function reserveFormatBits(matrix: number[][], size: number) {
  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
    if (matrix[8][size - 1 - i] === -1) matrix[8][size - 1 - i] = 0;
    if (matrix[size - 1 - i][8] === -1) matrix[size - 1 - i][8] = 0;
  }
  if (matrix[8][8] === -1) matrix[8][8] = 0;
}

function placeData(matrix: number[][], data: number[], size: number) {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;

  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // skip timing column

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (cc < 0) continue;
        if (matrix[row][cc] !== -1) continue;
        matrix[row][cc] = bitIdx < bits.length ? bits[bitIdx] : 0;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

function applyMask(matrix: number[][], reserved: number[][], size: number) {
  // Mask pattern 0: (row + col) % 2 === 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c] !== -1) continue; // don't mask reserved
      if ((r + c) % 2 === 0) {
        matrix[r][c] ^= 1;
      }
    }
  }
}

function placeFormatInfo(matrix: number[][], size: number) {
  // Format info for EC level L, mask 0 = 0b111011111000100
  const formatBits = 0b111011111000100;

  // Around top-left finder
  const positions1 = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> (14 - i)) & 1;
    const [r, c] = positions1[i];
    matrix[r][c] = bit;
  }

  // Around top-right and bottom-left finders
  const positions2 = [
    [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4],
    [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
    [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8],
    [size - 3, 8], [size - 2, 8], [size - 1, 8],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> (14 - i)) & 1;
    const [r, c] = positions2[i];
    matrix[r][c] = bit;
  }
}

function generateQRMatrix(text: string): number[][] {
  const version = getVersion(text.length);
  const size = getSize(version);
  const data = encodeData(text, version);

  const matrix = createMatrix(version);

  // Save reserved areas before placing data
  const reserved = matrix.map(row => [...row]);

  reserveFormatBits(matrix, size);
  const reservedWithFormat = matrix.map(row => [...row]);

  placeData(matrix, data, size);
  applyMask(matrix, reservedWithFormat, size);
  placeFormatInfo(matrix, size);

  // Fill any remaining -1 with 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === -1) matrix[r][c] = 0;
    }
  }

  return matrix;
}

// ── React Component ──

interface QRCodeProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
}

export default function QRCode({
  value,
  size = 200,
  bgColor = "#ffffff",
  fgColor = "#000000",
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const matrix = generateQRMatrix(value);
    const modules = matrix.length;
    const quiet = 4; // quiet zone
    const totalModules = modules + quiet * 2;
    const moduleSize = size / totalModules;

    canvas.width = size;
    canvas.height = size;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Draw modules
    ctx.fillStyle = fgColor;
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (matrix[r][c] === 1) {
          ctx.fillRect(
            (c + quiet) * moduleSize,
            (r + quiet) * moduleSize,
            moduleSize,
            moduleSize,
          );
        }
      }
    }
  }, [value, size, bgColor, fgColor]);

  if (!value) return null;

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "8px",
      }}
      aria-label={`QR code for address: ${value}`}
      role="img"
    />
  );
}

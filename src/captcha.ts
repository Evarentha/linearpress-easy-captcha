/*
 * Zero-Dependency PNG Captcha Generator
 *
 * Renders text captchas as PNG bitmaps without canvas, sharp, or other external dependencies.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Plain text captcha: generates a PNG bitmap (no canvas / sharp or other external dependencies).
 *
 * <p>Characters are rendered into a pixel buffer as 5x7 grid stroke glyphs (built-in stroke font),
 * then encoded per the PNG specification (node:zlib deflate + CRC32) and returned as standard
 * image/png data. The captcha text exists only in the server-side session and the image is a
 * pixel bitmap, so the text cannot be recovered by reading the DOM.</p>
 *
 * Adjustable parameters:
 * <ul>
 * <li>length — number of characters in the text</li>
 * <li>charset — digits only / letters only / mixed</li>
 * <li>complexity 1-3 — more noise dots and interference lines</li>
 * <li>distortion 1-3 — larger glyph rotation angles / skew amplitudes</li>
 * </ul>
 *
 * @since 1.0.0
 */

import zlib from 'node:zlib';
import type { CaptchaCharset } from './config.js';

export interface CaptchaOptions {
  length: number;
  charset: CaptchaCharset;
  complexity: number;
  distortion: number;
}

/** 数字集：剔除 0/1 避免与字母 O/I/l 混淆。 */
const DIGITS = '23456789';
/** 字母集（大写）：剔除 I/O 等易混字符。 */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const INK = ['#1f2937', '#374151', '#991b1b', '#1d4ed8', '#166534', '#7c2d12', '#4c1d95', '#0e7490', '#92400e'];
const BACKGROUNDS = ['#f9fafb', '#fefce8', '#ecfeff', '#fdf4ff'];

const rand = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(list: T[]): T => list[rand(0, list.length - 1)];

const hex = (value: string): [number, number, number] => {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

/** 依据字符集随机生成长度为 length 的验证码文本（全大写，比较时忽略大小写）。 */
export function randomText(options: CaptchaOptions): string {
  const pool = options.charset === 'number' ? DIGITS
    : options.charset === 'letter' ? LETTERS
      : DIGITS + LETTERS;
  let out = '';
  for (let i = 0; i < Math.max(1, options.length); i++) out += pool[rand(0, pool.length - 1)];
  return out;
}

// ---------------------------------------------------------------- 内置笔画字体
/** 5x7 网格（x∈0..4, y∈0..6）上的线段字形；每段为 [x1,y1,x2,y2]。 */
const GLYPHS: Record<string, number[][]> = {
  '0': [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 6]],
  '1': [[1, 1, 2, 0], [2, 0, 2, 6]],
  '2': [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 6], [0, 6, 4, 6]],
  '3': [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [4, 3, 4, 6], [4, 6, 0, 6]],
  '4': [[4, 0, 4, 3], [0, 3, 4, 3], [2, 3, 2, 6]],
  '5': [[0, 0, 4, 0], [0, 0, 0, 3], [0, 3, 4, 3], [4, 3, 4, 6], [0, 6, 4, 6]],
  '6': [[2, 0, 2, 3], [4, 3, 0, 3], [0, 3, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3]],
  '7': [[0, 0, 4, 0], [4, 0, 1, 6]],
  '8': [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [0, 3, 4, 3], [0, 3, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3]],
  '9': [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [2, 3, 2, 6]],
  'A': [[0, 6, 2, 0], [2, 0, 4, 6], [0, 3, 4, 3]],
  'B': [[0, 0, 0, 6], [0, 0, 3, 0], [3, 0, 3, 2], [0, 2, 3, 2], [0, 3, 3, 3], [3, 3, 3, 6], [0, 6, 3, 6]],
  'C': [[0, 0, 4, 0], [0, 0, 0, 6], [0, 6, 4, 6]],
  'D': [[0, 0, 0, 6], [0, 0, 3, 0], [3, 0, 3, 6], [0, 6, 3, 6]],
  'E': [[0, 0, 0, 6], [0, 0, 4, 0], [0, 3, 4, 3], [0, 6, 4, 6]],
  'F': [[0, 0, 0, 6], [0, 0, 4, 0], [0, 3, 4, 3]],
  'G': [[0, 0, 4, 0], [0, 0, 0, 6], [0, 6, 4, 6], [4, 0, 4, 3], [2, 3, 4, 3], [4, 3, 4, 6]],
  'H': [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  'I': [[2, 0, 2, 6]],
  'J': [[4, 0, 4, 6], [1, 6, 4, 6], [1, 3, 1, 5]],
  'K': [[0, 0, 0, 6], [0, 3, 4, 0], [0, 3, 4, 6]],
  'L': [[0, 0, 0, 6], [0, 6, 4, 6]],
  'M': [[0, 6, 0, 0], [0, 0, 2, 3], [2, 3, 4, 0], [4, 0, 4, 6]],
  'N': [[0, 6, 0, 0], [0, 0, 4, 6], [4, 6, 4, 0]],
  'O': [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0]],
  'P': [[0, 0, 0, 6], [0, 0, 3, 0], [3, 0, 3, 3], [0, 3, 3, 3]],
  'Q': [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0], [2, 4, 4, 6]],
  'R': [[0, 0, 0, 6], [0, 0, 3, 0], [3, 0, 3, 3], [0, 3, 3, 3], [0, 3, 4, 6]],
  'S': [[0, 0, 4, 0], [0, 0, 0, 3], [0, 3, 4, 3], [4, 3, 4, 6], [0, 6, 4, 6]],
  'T': [[0, 0, 4, 0], [2, 0, 2, 6]],
  'U': [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0]],
  'V': [[0, 0, 2, 6], [2, 6, 4, 0]],
  'W': [[0, 0, 1, 6], [1, 6, 2, 3], [2, 3, 3, 6], [3, 6, 4, 0]],
  'X': [[0, 0, 4, 6], [4, 0, 0, 6]],
  'Y': [[0, 0, 2, 3], [4, 0, 2, 3], [2, 3, 2, 6]],
  'Z': [[0, 0, 4, 0], [4, 0, 0, 6], [0, 6, 4, 6]]
};

/** 网格坐标 → 像素：旋转（扭曲）、倾斜（扭曲）、缩放、位移。 */
function transformPoint(px: number, py: number, cx: number, cy: number, scale: number, angleDeg: number, skewDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  const x0 = px - 2.5;
  const y0 = py - 3.5;
  const rx = x0 * Math.cos(rad) - y0 * Math.sin(rad);
  const ry = x0 * Math.sin(rad) + y0 * Math.cos(rad);
  const sx = rx + ry * Math.tan((skewDeg * Math.PI) / 180);
  return [cx + sx * scale, cy + ry * scale];
}

/** 在 RGB 缓冲上画线段（thickness 为 1 或 2 像素）。 */
function drawSegment(img: Uint8Array, width: number, height: number, x1n: number, y1n: number, x2n: number, y2n: number, color: [number, number, number], thickness: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2n - x1n), Math.abs(y2n - y1n))));
  const puts = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 3;
    img[offset] = color[0]; img[offset + 1] = color[1]; img[offset + 2] = color[2];
    if (thickness >= 2) {
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < width && ny < height) {
          const off = (ny * width + nx) * 3;
          img[off] = color[0]; img[off + 1] = color[1]; img[off + 2] = color[2];
        }
      }
    }
  };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    puts(Math.round(x1n + (x2n - x1n) * t), Math.round(y1n + (y2n - y1n) * t));
  }
}

// ---------------------------------------------------------------- PNG 编码
let crcTable: Uint32Array | undefined;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** 将 RGB 像素缓冲编码为标准 PNG（8bit RGB，无 alpha，filter 0）。 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = rgb[y * stride + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- 渲染
/** 渲染验证码 PNG（每次调用生成独立随机图形）。 */
export function renderCaptchaPng(text: string, options: CaptchaOptions): Buffer {
  const count = Math.max(1, text.length);
  const width = count * 36 + 20;
  const height = 64;
  const scale = 4; // 5x7 网格单元 → 像素（字符高约 28px，宽约 20px）

  const background = hex(pick(BACKGROUNDS));
  const img = new Uint8Array(width * height * 3);
  for (let i = 0; i < img.length; i += 3) {
    img[i] = background[0]; img[i + 1] = background[1]; img[i + 2] = background[2];
  }

  // 复杂程度 1/2/3 → 3/5/7 条干扰线、30/50/70 个干扰点；线条 50% 混入背景色削弱对比。
  const lines = options.complexity * 2 + 1;
  const dots = options.complexity * 20 + 10;
  for (let i = 0; i < dots; i++) {
    const x = rand(0, width - 1);
    const y = rand(0, height - 1);
    const color = hex(pick(INK));
    const offset = (y * width + x) * 3;
    img[offset] = Math.round((background[0] + color[0]) / 2);
    img[offset + 1] = Math.round((background[1] + color[1]) / 2);
    img[offset + 2] = Math.round((background[2] + color[2]) / 2);
  }
  for (let i = 0; i < lines; i++) {
    const x1 = rand(0, Math.floor(width / 3)), y1 = rand(0, height);
    const x2 = rand(Math.floor(width * 2 / 3), width - 1), y2 = rand(0, height);
    const color = hex(pick(INK));
    const mixed: [number, number, number] = [
      Math.round((background[0] + color[0]) / 2),
      Math.round((background[1] + color[1]) / 2),
      Math.round((background[2] + color[2]) / 2)
    ];
    drawSegment(img, width, height, x1, y1, x2, y2, mixed, 1);
  }

  // 变形程度 1/2/3 → 旋转 ±12/±20/±28°、倾斜 ±6/±10/±14、字符随机上下位移。
  const maxAngle = 4 + options.distortion * 8;
  const maxSkew = 2 + options.distortion * 4;
  for (let i = 0; i < count; i++) {
    const glyph = GLYPHS[text[i]];
    if (!glyph) continue;
    const cx = 26 + i * 36 + rand(-4, 4);
    const cy = 34 + rand(-maxSkew / 2, maxSkew / 2);
    const angle = rand(-maxAngle, maxAngle);
    const skew = rand(-maxSkew, maxSkew);
    const color = hex(pick(INK));
    for (const [x1, y1, x2, y2] of glyph) {
      const [p1x, p1y] = transformPoint(x1, y1, cx, cy, scale, angle, skew);
      const [p2x, p2y] = transformPoint(x2, y2, cx, cy, scale, angle, skew);
      drawSegment(img, width, height, p1x, p1y, p2x, p2y, color, 1);
    }
  }

  return encodePng(width, height, img);
}
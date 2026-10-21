export const FRAME_WIDTH = 960;
export const FRAME_HEIGHT = 1280;
export const SQUARE_SIZE = 960;
export const PRINT_PADDING = 56;
export const PRINT_LINE_HEIGHT = 1.35;
export const MAX_PAGES = 6;
export const MAX_STRIP_HEIGHT = 2400;
export const MAX_SCROLL_PAGES = 12;
export const COLUMN_MAX_WIDTH = 2000;
export const MIN_SHEET_WIDTH = 980;
export const WIDTH_FUDGE = 4;

export const clampSheetWidth = (value: number): number => {
  if (!Number.isFinite(value)) return COLUMN_MAX_WIDTH;
  return Math.min(COLUMN_MAX_WIDTH, Math.max(MIN_SHEET_WIDTH, Math.round(value)));
};

export type FrameShape = "frame" | "square" | "strip";

export const printSheetPlacement = (
  sourceWidth: number,
  sourceHeight: number,
  sheetWidth: number = COLUMN_MAX_WIDTH,
): { dx: number; dy: number; dw: number; dh: number } => {
  const width = clampSheetWidth(sheetWidth);
  const scale = Math.min(1, width / sourceWidth, FRAME_WIDTH / sourceHeight);
  const dw = Math.max(1, Math.round(sourceWidth * scale));
  const dh = Math.max(1, Math.round(sourceHeight * scale));
  return {
    dx: 0,
    dy: Math.round((FRAME_WIDTH - dh) / 2),
    dw,
    dh,
  };
};

export const textBlockDepth = (
  sheetWidth: number,
  padding: number,
  linePx: number,
  lineCount: number,
): number => {
  if (lineCount < 1 || linePx < 1) return sheetWidth;
  return Math.min(sheetWidth, Math.max(1, padding * 2 + lineCount * linePx));
};

export const frameGeometry = (
  shape: FrameShape,
): { width: number; height: number } => {
  if (shape === "square") return { width: SQUARE_SIZE, height: SQUARE_SIZE };
  return { width: FRAME_WIDTH, height: FRAME_HEIGHT };
};

export type PlanOptions = {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  charWidth: number;
  padding: number;
  maxPages: number;
  header?: boolean;
  sheetWidth?: number;
};

export type PagePlan = {
  width: number;
  height: number;
  padding: number;
  fontSize: number;
  linePx: number;
  lines: string[];
};

export type PlanResult = {
  pages: PagePlan[];
  truncated: boolean;
  maxChars: number;
  contentLineBudget: number;
};

const pageHeader = (index: number, total: number, maxChars: number): string => {
  const full = `кадр ${index + 1}/${total}`;
  if (full.length <= maxChars) return full;
  return `${index + 1}/${total}`;
};

export const wrapLine = (line: string, maxChars: number): string[] => {
  if (maxChars < 1 || line.length <= maxChars) return [line];

  const indent = /^ */.exec(line)?.[0] ?? "";
  const extra = `${indent}  `;
  const continuation = extra.length <= maxChars / 2 ? extra : "";
  const lines: string[] = [];
  let rest = line;
  let prefix = "";

  while (rest.length > 0) {
    if (prefix.length >= maxChars) prefix = "";
    const room = maxChars - prefix.length;
    if (room < 1) {
      lines.push(rest);
      break;
    }
    if (rest.length <= room) {
      lines.push(prefix + rest);
      break;
    }

    const window = rest.slice(0, room);
    const half = Math.floor(room * 0.5);
    const spaceAt = window.lastIndexOf(" ");
    const commaAt = window.lastIndexOf(",");
    let cut = room;
    let next = room;
    if (spaceAt >= half && spaceAt >= commaAt) {
      cut = spaceAt;
      next = spaceAt + 1;
    } else if (commaAt >= half) {
      cut = commaAt + 1;
      next = commaAt + 1;
    }
    if (cut < 1) {
      cut = room;
      next = room;
    }

    lines.push((prefix + rest.slice(0, cut)).trimEnd());
    rest = rest.slice(next);
    prefix = continuation;
  }

  return lines;
};

const wrapText = (text: string, maxChars: number): string[] => {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    lines.push(...wrapLine(line, maxChars));
  }
  return lines;
};

const chunkLines = (lines: string[], size: number): string[][] => {
  if (lines.length === 0) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks;
};

export type ColumnOptions = {
  fontSize: number;
  lineHeight: number;
  charWidth: number;
  padding: number;
  maxPages: number;
  sheetWidth?: number;
};

export const planColumn = (text: string, options: ColumnOptions): PlanResult => {
  const linePx = Math.ceil(options.fontSize * options.lineHeight);
  const lineAxis = FRAME_WIDTH;
  const sheet = clampSheetWidth(options.sheetWidth ?? COLUMN_MAX_WIDTH);
  const usable = lineAxis - options.padding * 2 - WIDTH_FUDGE;
  const maxChars = Math.max(1, Math.floor(usable / options.charWidth));
  const maxLines = Math.max(1, Math.floor((sheet - options.padding * 2) / linePx));

  if (text.trim() === "") {
    return { pages: [], truncated: false, maxChars, contentLineBudget: maxLines };
  }

  const wrapped = wrapText(text, maxChars);
  const chunks = chunkLines(wrapped, maxLines);
  const limited = chunks.slice(0, Math.max(1, options.maxPages));
  const pages = limited.map((lines) => ({
    width: sheet,
    height: lineAxis,
    padding: options.padding,
    fontSize: options.fontSize,
    linePx,
    lines,
  }));

  return {
    pages,
    truncated: chunks.length > limited.length,
    maxChars,
    contentLineBudget: maxLines,
  };
};

export const planPages = (text: string, options: PlanOptions): PlanResult => {
  const linePx = Math.ceil(options.fontSize * options.lineHeight);
  const usableWidth = options.width - options.padding * 2 - WIDTH_FUDGE;
  const maxChars = Math.max(1, Math.floor(usableWidth / options.charWidth));
  const sheet = options.sheetWidth ? clampSheetWidth(options.sheetWidth) : options.height;
  const stack = Math.min(options.height, sheet);
  const innerHeight = Math.max(linePx, stack - options.padding * 2);
  const slots = Math.max(1, Math.floor(innerHeight / linePx));
  const withHeader = options.header !== false && slots >= 2;
  const contentLineBudget = withHeader ? slots - 1 : slots;

  if (text.trim() === "") {
    return { pages: [], truncated: false, maxChars, contentLineBudget };
  }

  const wrapped = wrapText(text, maxChars);
  const chunks = chunkLines(wrapped, contentLineBudget);
  const limited = chunks.slice(0, Math.max(1, options.maxPages));
  const total = limited.length;

  const pages = limited.map((chunk, index) => {
    const lines = withHeader ? [pageHeader(index, total, maxChars), ...chunk] : chunk;
    return {
      width: options.width,
      height: options.height,
      padding: options.padding,
      fontSize: options.fontSize,
      linePx,
      lines,
    };
  });

  return {
    pages,
    truncated: chunks.length > limited.length,
    maxChars,
    contentLineBudget,
  };
};

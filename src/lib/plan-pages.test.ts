import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonText } from "./json-text.ts";
import {
  contentLength,
  groupTapeSegments,
  planPages,
  wrapLine,
  type PagePlan,
  type PlanOptions,
} from "./plan-pages.ts";

const baseOptions = (overrides: Partial<PlanOptions> = {}): PlanOptions => ({
  width: 100,
  height: 80,
  fontSize: 10,
  lineHeight: 1,
  charWidth: 10,
  padding: 10,
  maxPages: 8,
  ...overrides,
});

test("wrapLine keeps a short line intact", () => {
  assert.deepEqual(wrapLine("заказ", 10), ["заказ"]);
});

test("wrapLine breaks a long token and indents the continuation", () => {
  const lines = wrapLine('"abcdefghijklmnopqrstuvwxyz"', 10);
  assert.deepEqual(lines, ['"abcdefghi', "  jklmnopq", "  rstuvwxy", '  z"']);
  assert.ok(lines.every((line) => line.length <= 10));
});

test("wrapLine prefers a comma near the end of the line", () => {
  assert.deepEqual(wrapLine("one,two,three,four", 10), [
    "one,two,",
    "  three,",
    "  four",
  ]);
});

test("wrapLine keeps nested indent on wrapped JSON", () => {
  const lines = wrapLine('    "имя": "очень длинное значение"', 20);
  assert.deepEqual(lines, [
    '    "имя": "очень',
    "      длинное",
    '      значение"',
  ]);
  assert.ok(lines.every((line) => line.length <= 20));
});

test("planPages fits a short text on one fixed frame", () => {
  const plan = planPages('{\n  "a": 1\n}', baseOptions({ width: 220 }));
  assert.equal(plan.pages.length, 1);
  assert.equal(plan.pages[0]?.lines[0], "кадр 1/1");
  assert.equal(plan.pages[0]?.height, 80);
  assert.equal(plan.truncated, false);
  assert.ok(
    plan.pages[0]?.lines.every((line) => line.length <= plan.maxChars),
  );
});

test("planPages shortens the header when the line is narrow", () => {
  const plan = planPages("abcdefg", baseOptions());
  assert.equal(plan.maxChars, 7);
  assert.equal(plan.pages[0]?.lines[0], "1/1");
});

test("planPages splits long text and numbers the frames", () => {
  const line = "abcdefg";
  const text = Array.from({ length: 12 }, () => line).join("\n");
  const plan = planPages(text, baseOptions({ width: 220 }));
  assert.equal(plan.contentLineBudget, 5);
  assert.equal(plan.pages.length, 3);
  assert.equal(plan.pages[0]?.lines[0], "кадр 1/3");
  assert.equal(plan.pages[1]?.lines[0], "кадр 2/3");
  assert.equal(plan.pages[2]?.lines[0], "кадр 3/3");
  assert.equal(plan.pages[0]?.lines.length, 6);
  assert.equal(plan.pages[2]?.lines.length, 3);
});

test("planPages reports that later frames were cut", () => {
  const text = Array.from({ length: 12 }, () => "abcdefg").join("\n");
  const plan = planPages(text, baseOptions({ width: 220, maxPages: 2 }));
  assert.equal(plan.pages.length, 2);
  assert.equal(plan.truncated, true);
  assert.equal(plan.pages[0]?.lines[0], "кадр 1/2");
});

test("planPages continues a scroll on the next photo without a header", () => {
  const text = Array.from({ length: 12 }, () => "abcdefg").join("\n");
  const plan = planPages(text, baseOptions({ width: 220, header: false }));
  assert.equal(plan.contentLineBudget, 6);
  assert.equal(plan.pages.length, 2);
  assert.equal(plan.pages[0]?.lines[0], "abcdefg");
  assert.equal(plan.pages[0]?.height, 80);
  assert.equal(plan.pages[1]?.lines[0], "abcdefg");
  assert.equal(plan.pages[1]?.height, 80);
});

test("planPages keeps a short scroll on a normal photo", () => {
  const plan = planPages("записка", baseOptions({ width: 220, header: false }));
  assert.equal(plan.pages.length, 1);
  assert.deepEqual(plan.pages[0]?.lines, ["записка"]);
  assert.equal(plan.pages[0]?.width, 220);
  assert.equal(plan.pages[0]?.height, 80);
});

test("contentLength follows the longest line", () => {
  assert.equal(contentLength(["аб", "абвгде"], 10, 4), 8 + 60);
});

test("groupTapeSegments joins pages until the length limit", () => {
  const page = (width: number): PagePlan => ({
    width,
    height: 100,
    padding: 4,
    fontSize: 10,
    linePx: 12,
    lines: ["аб"],
  });
  const groups = groupTapeSegments([page(40), page(40), page(40)], 100);
  assert.deepEqual(
    groups.map((group) => group.map((item) => item.width)),
    [
      [40, 40],
      [40],
    ],
  );
});

test("planPages ignores blank input", () => {
  const plan = planPages("  \n", baseOptions());
  assert.deepEqual(plan.pages, []);
});

test("parseJsonText pretty-prints objects and keeps raw text", () => {
  const parsed = parseJsonText(' \uFEFF{"б":1} ');
  assert.equal(parsed.kind, "ok");
  if (parsed.kind !== "ok") return;
  assert.equal(parsed.raw, '{"б":1}');
  assert.equal(parsed.pretty, '{\n  "б": 1\n}');
});

test("parseJsonText explains broken JSON and rejects a huge paste", () => {
  const broken = parseJsonText("{");
  assert.equal(broken.kind, "error");
  assert.equal(parseJsonText("").kind, "empty");
  assert.equal(parseJsonText("x".repeat(100_001)).kind, "error");
});

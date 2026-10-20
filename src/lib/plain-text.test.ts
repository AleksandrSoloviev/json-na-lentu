import assert from "node:assert/strict";
import test from "node:test";

import { MAX_TEXT_CHARS, preparePlainText } from "./plain-text.ts";

test("preparePlainText keeps lines, spaces and a leading indent", () => {
  const prepared = preparePlainText("  список\r\nмолоко\r\n  хлеб");
  assert.equal(prepared.kind, "ok");
  if (prepared.kind !== "ok") return;
  assert.equal(prepared.text, "  список\nмолоко\n  хлеб");
});

test("preparePlainText drops a byte order mark and ignores blank input", () => {
  const prepared = preparePlainText("\uFEFFзаписка");
  assert.equal(prepared.kind, "ok");
  if (prepared.kind !== "ok") return;
  assert.equal(prepared.text, "записка");
  assert.equal(preparePlainText(" \n\t").kind, "empty");
});

test("preparePlainText rejects a huge paste", () => {
  const prepared = preparePlainText("а".repeat(MAX_TEXT_CHARS + 1));
  assert.equal(prepared.kind, "error");
});

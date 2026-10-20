import assert from "node:assert/strict";
import test from "node:test";

import { photoFileName } from "./photo-name.ts";

test("photoFileName uses the camera pattern", () => {
  assert.equal(photoFileName(0), "PHO00000.JPG");
  assert.equal(photoFileName(7), "PHO00007.JPG");
  assert.equal(photoFileName(100000), "PHO99999.JPG");
});

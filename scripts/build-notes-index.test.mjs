import assert from "node:assert/strict";
import test from "node:test";

import { selectAvailableNotes } from "./build-notes-index.mjs";

const actualNote = { id: "42", demo: false };
const demoNotes = [
  { id: "demo-1", demo: true },
  { id: "demo-2", demo: true },
];

test("selectAvailableNotes uses actual notes without mixing in demos", () => {
  const result = selectAvailableNotes([...demoNotes, actualNote]);

  assert.deepEqual(result.notes, [actualNote]);
  assert.equal(result.usingDemoFallback, false);
});

test("selectAvailableNotes uses demos only when actual notes are empty", () => {
  const result = selectAvailableNotes(demoNotes);

  assert.deepEqual(result.notes, demoNotes);
  assert.equal(result.usingDemoFallback, true);
});

test("selectAvailableNotes can disable the local demo fallback", () => {
  const result = selectAvailableNotes(demoNotes, false);

  assert.deepEqual(result.notes, []);
  assert.equal(result.usingDemoFallback, false);
});

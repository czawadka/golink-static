import { test } from "node:test";
import assert from "node:assert/strict";
import { pagerState } from "../src/assets/pager.js";

test("pagerState disables both buttons on a single page", () => {
  const result = pagerState(1, 1);
  assert.equal(result.prevDisabled, true);
  assert.equal(result.nextDisabled, true);
  assert.equal(result.label, "Page 1 of 1");
  assert.equal(result.prevPage, 1);
  assert.equal(result.nextPage, 1);
});

test("pagerState on the first of several pages disables only prev", () => {
  const result = pagerState(1, 3);
  assert.equal(result.prevDisabled, true);
  assert.equal(result.nextDisabled, false);
  assert.equal(result.nextPage, 2);
});

test("pagerState on a middle page disables neither button", () => {
  const result = pagerState(2, 3);
  assert.equal(result.prevDisabled, false);
  assert.equal(result.nextDisabled, false);
  assert.equal(result.prevPage, 1);
  assert.equal(result.nextPage, 3);
});

test("pagerState on the last page disables only next", () => {
  const result = pagerState(3, 3);
  assert.equal(result.prevDisabled, false);
  assert.equal(result.nextDisabled, true);
  assert.equal(result.prevPage, 2);
  assert.equal(result.nextPage, 3);
});

test("pagerState formats the label for an arbitrary page pair", () => {
  const result = pagerState(4, 7);
  assert.equal(result.label, "Page 4 of 7");
});

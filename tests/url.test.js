import { test } from "node:test";
import assert from "node:assert/strict";
import { getParam, setParam } from "../src/assets/url.js";

test("getParam returns empty string when the param is absent", () => {
  assert.equal(getParam("https://go.example/", "s"), "");
});

test("getParam returns the decoded value when present", () => {
  assert.equal(getParam("https://go.example/?s=go+links", "s"), "go links");
});

test("setParam adds the param when given a non-empty value", () => {
  assert.equal(setParam("https://go.example/", "s", "git"), "/?s=git");
});

test("setParam overwrites an existing value", () => {
  assert.equal(setParam("https://go.example/?s=git", "s", "wiki"), "/?s=wiki");
});

test("setParam removes the param entirely when given an empty value", () => {
  assert.equal(setParam("https://go.example/?s=git", "s", ""), "/");
});

test("setParam preserves pathname and hash", () => {
  assert.equal(setParam("https://go.example/docs#section", "s", "git"), "/docs?s=git#section");
});

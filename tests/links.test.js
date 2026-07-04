import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasFromPath, findByAlias, filterLinks, paginate } from "../src/assets/links.js";

test("aliasFromPath strips a known base prefix", () => {
  assert.equal(aliasFromPath("/golink-static/docs", "/golink-static"), "docs");
});

test("aliasFromPath preserves internal slashes for multi-segment aliases", () => {
  assert.equal(aliasFromPath("/golink-static/team/eng", "/golink-static"), "team/eng");
});

test("aliasFromPath trims a trailing slash", () => {
  assert.equal(aliasFromPath("/golink-static/docs/", "/golink-static"), "docs");
});

test("aliasFromPath works with no base prefix (root hosting)", () => {
  assert.equal(aliasFromPath("/docs", ""), "docs");
  assert.equal(aliasFromPath("/team/eng", ""), "team/eng");
});

test("aliasFromPath decodes percent-encoded characters", () => {
  assert.equal(aliasFromPath("/team%20eng", ""), "team eng");
});

test("findByAlias matches case-insensitively", () => {
  const links = [{ alias: "Docs", url: "https://example.com/docs" }];
  assert.equal(findByAlias(links, "docs").url, "https://example.com/docs");
  assert.equal(findByAlias(links, "DOCS").url, "https://example.com/docs");
});

test("findByAlias matches multi-segment aliases", () => {
  const links = [{ alias: "team/eng", url: "https://example.com/eng" }];
  assert.equal(findByAlias(links, "team/eng").url, "https://example.com/eng");
});

test("findByAlias returns undefined when nothing matches", () => {
  assert.equal(findByAlias([], "docs"), undefined);
  assert.equal(findByAlias([{ alias: "docs", url: "x" }], "wiki"), undefined);
});

test("filterLinks with an empty query returns the original order unchanged", () => {
  const links = [{ alias: "b" }, { alias: "a" }];
  assert.deepEqual(filterLinks(links, ""), links);
});

test("filterLinks matches against alias or description, case-insensitively", () => {
  const links = [
    { alias: "docs", description: "Team documentation" },
    { alias: "wiki", description: "Internal wiki" }
  ];
  assert.deepEqual(filterLinks(links, "TEAM"), [links[0]]);
  assert.deepEqual(filterLinks(links, "wiki"), [links[1]]);
});

test("filterLinks returns an empty array when nothing matches", () => {
  assert.deepEqual(filterLinks([{ alias: "docs" }], "zzz"), []);
});

test("paginate slices to the requested page", () => {
  const items = [1, 2, 3, 4, 5];
  const result = paginate(items, 2, 2);
  assert.deepEqual(result.pageItems, [3, 4]);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 3);
});

test("paginate clamps an out-of-range page down to the last valid page", () => {
  const items = [1, 2, 3];
  const result = paginate(items, 99, 2);
  assert.equal(result.page, 2);
  assert.deepEqual(result.pageItems, [3]);
});

test("paginate clamps a page below 1 up to 1", () => {
  const result = paginate([1, 2, 3], 0, 2);
  assert.equal(result.page, 1);
});

test("paginate reports at least 1 total page for an empty list", () => {
  const result = paginate([], 1, 10);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(result.pageItems, []);
});

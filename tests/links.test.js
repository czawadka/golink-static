import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasFromPath, findByAlias, resolveAlias, filterLinks, takeBatch } from "../src/assets/links.js";

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

test("resolveAlias returns the entry directly when its url isn't a chain", () => {
  const links = [{ alias: "docs", url: "https://example.com/docs" }];
  const entry = resolveAlias(links, "docs", "https://site.example", "");
  assert.equal(entry.url, "https://example.com/docs");
});

test("resolveAlias follows a single-hop chain via a relative path", () => {
  const links = [
    { alias: "a", url: "/b" },
    { alias: "b", url: "https://external.example/dest" }
  ];
  const entry = resolveAlias(links, "a", "https://site.example", "");
  assert.equal(entry.url, "https://external.example/dest");
});

test("resolveAlias follows multi-hop chains", () => {
  const links = [
    { alias: "a", url: "/b" },
    { alias: "b", url: "/c" },
    { alias: "c", url: "https://external.example/dest" }
  ];
  const entry = resolveAlias(links, "a", "https://site.example", "");
  assert.equal(entry.url, "https://external.example/dest");
});

test("resolveAlias follows a bare relative (no leading slash) chain link under a non-root base prefix", () => {
  const links = [
    { alias: "a", url: "b" },
    { alias: "b", url: "https://external.example/dest" }
  ];
  const entry = resolveAlias(links, "a", "https://site.example", "/golink-static");
  assert.equal(entry.url, "https://external.example/dest");
});

test("resolveAlias returns null when the starting alias doesn't exist", () => {
  assert.equal(resolveAlias([], "missing", "https://site.example", ""), null);
});

test("resolveAlias returns null when a chained alias points to a nonexistent alias", () => {
  const links = [{ alias: "a", url: "/b" }];
  assert.equal(resolveAlias(links, "a", "https://site.example", ""), null);
});

test("resolveAlias returns null for a single self-referencing entry", () => {
  const links = [{ alias: "a", url: "/a" }];
  assert.equal(resolveAlias(links, "a", "https://site.example", ""), null);
});

test("resolveAlias detects a two-hop cycle and returns null instead of looping forever", () => {
  const links = [
    { alias: "a", url: "/b" },
    { alias: "b", url: "/a" }
  ];
  assert.equal(resolveAlias(links, "a", "https://site.example", ""), null);
});

test("resolveAlias respects the base prefix when detecting internal aliases", () => {
  const links = [
    { alias: "a", url: "https://site.example/golink-static/b" },
    { alias: "b", url: "https://external.example/dest" }
  ];
  const entry = resolveAlias(links, "a", "https://site.example", "/golink-static");
  assert.equal(entry.url, "https://external.example/dest");
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

test("takeBatch slices the requested window and reports more remaining", () => {
  const items = [1, 2, 3, 4, 5];
  const result = takeBatch(items, 0, 2);
  assert.deepEqual(result.batch, [1, 2]);
  assert.equal(result.nextOffset, 2);
  assert.equal(result.hasMore, true);
});

test("takeBatch continues from a given offset", () => {
  const items = [1, 2, 3, 4, 5];
  const result = takeBatch(items, 2, 2);
  assert.deepEqual(result.batch, [3, 4]);
  assert.equal(result.nextOffset, 4);
  assert.equal(result.hasMore, true);
});

test("takeBatch reports hasMore false once the slice reaches the end exactly", () => {
  const items = [1, 2, 3, 4];
  const result = takeBatch(items, 2, 2);
  assert.deepEqual(result.batch, [3, 4]);
  assert.equal(result.hasMore, false);
});

test("takeBatch with Infinity count returns everything remaining", () => {
  const items = [1, 2, 3, 4, 5];
  const result = takeBatch(items, 1, Infinity);
  assert.deepEqual(result.batch, [2, 3, 4, 5]);
  assert.equal(result.nextOffset, 5);
  assert.equal(result.hasMore, false);
});

test("takeBatch on an empty array returns an empty batch with no more remaining", () => {
  const result = takeBatch([], 0, 10);
  assert.deepEqual(result.batch, []);
  assert.equal(result.nextOffset, 0);
  assert.equal(result.hasMore, false);
});

test("takeBatch at an offset already past the end returns an empty batch", () => {
  const items = [1, 2, 3];
  const result = takeBatch(items, 3, 10);
  assert.deepEqual(result.batch, []);
  assert.equal(result.nextOffset, 3);
  assert.equal(result.hasMore, false);
});

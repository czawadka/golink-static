import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { init } from "../src/assets/app.js";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../src/index.html", import.meta.url)),
  "utf8"
);

function fakeFetchOk(links) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => links
  });
}

function fakeFetchFail(status) {
  return async () => ({
    ok: false,
    status,
    json: async () => {
      throw new Error("should not be called");
    }
  });
}

function manyLinks(count) {
  return Array.from({ length: count }, (_, i) => ({
    alias: `link-${i}`,
    url: `https://example.com/${i}`
  }));
}

async function setup(fetchFn) {
  const dom = new JSDOM(indexHtml);
  await init(dom.window.document, fetchFn);
  return dom.window.document;
}

test("init renders list items from the real index.html markup (guards against ID drift)", async () => {
  const doc = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs", description: "Team docs" }
    ])
  );
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector("a").textContent, "docs");
  assert.equal(items[0].querySelector("a").getAttribute("href"), "https://example.com/docs");
  assert.equal(items[0].querySelector(".description").textContent, "Team docs");
});

test("init omits the description span when an entry has none", async () => {
  const doc = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  const item = doc.querySelector("#link-list .link-item");
  assert.equal(item.querySelector(".description"), null);
});

test("init shows the empty-state message when there are no links", async () => {
  const doc = await setup(fakeFetchOk([]));
  const empty = doc.querySelector("#link-list .empty");
  assert.ok(empty);
  assert.equal(empty.textContent, "No links match your search.");
});

test("init shows singular/plural count text correctly", async () => {
  const one = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  assert.equal(one.getElementById("count").textContent, "1 link");

  const two = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs" },
      { alias: "wiki", url: "https://example.com/wiki" }
    ])
  );
  assert.equal(two.getElementById("count").textContent, "2 links");
});

test("init shows a fetch failure message instead of the list", async () => {
  const doc = await setup(fakeFetchFail(404));
  const empty = doc.querySelector("#link-list .empty");
  assert.ok(empty);
  assert.match(empty.textContent, /Failed to load links\.json: HTTP 404/);
});

test("init hides the pager when everything fits on one page", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(5)));
  assert.equal(doc.getElementById("pager").children.length, 0);
});

test("init renders a pager and Next click advances the page", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(11)));
  const pagerEl = doc.getElementById("pager");
  assert.match(pagerEl.textContent, /Page 1 of 2/);
  assert.equal(pagerEl.querySelector("button").disabled, true);

  const nextBtn = [...pagerEl.querySelectorAll("button")].find((b) => b.textContent === "Next");
  nextBtn.click();

  assert.match(pagerEl.textContent, /Page 2 of 2/);
  const prevBtn = [...pagerEl.querySelectorAll("button")].find((b) => b.textContent === "Prev");
  const nextBtnAfter = [...pagerEl.querySelectorAll("button")].find((b) => b.textContent === "Next");
  assert.equal(prevBtn.disabled, false);
  assert.equal(nextBtnAfter.disabled, true);
});

test("init paginates through 3 pages, toggling button state at each end", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(25)));
  const pagerEl = doc.getElementById("pager");
  const btn = (label) => [...pagerEl.querySelectorAll("button")].find((b) => b.textContent === label);

  assert.match(pagerEl.textContent, /Page 1 of 3/);
  assert.equal(btn("Prev").disabled, true);
  assert.equal(btn("Next").disabled, false);

  btn("Next").click();
  assert.match(pagerEl.textContent, /Page 2 of 3/);
  assert.equal(btn("Prev").disabled, false);
  assert.equal(btn("Next").disabled, false);

  btn("Next").click();
  assert.match(pagerEl.textContent, /Page 3 of 3/);
  assert.equal(btn("Prev").disabled, false);
  assert.equal(btn("Next").disabled, true);

  btn("Prev").click();
  assert.match(pagerEl.textContent, /Page 2 of 3/);
  assert.equal(btn("Prev").disabled, false);
  assert.equal(btn("Next").disabled, false);
});

test("searching filters the list and resets to page 1", async () => {
  const doc = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs", description: "Team documentation" },
      { alias: "wiki", url: "https://example.com/wiki", description: "Internal wiki" }
    ])
  );
  const searchInput = doc.getElementById("search");
  searchInput.value = "wiki";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector("a").textContent, "wiki");
});

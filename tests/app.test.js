import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { init } from "../src/assets/app.js";
import { SEARCH_PARAM } from "../src/assets/config.js";

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

function keydown(el, key) {
  el.dispatchEvent(new el.ownerDocument.defaultView.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

async function setup(fetchFn, url = "https://go.example/") {
  const dom = new JSDOM(indexHtml, { url });
  dom.window.navigator.clipboard = {
    writeText: async (text) => {
      dom.window.__copiedText = text;
    }
  };
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
  assert.equal(items[0].querySelector(".alias").textContent, "docs");
  assert.equal(items[0].querySelector(".alias").getAttribute("href"), "https://go.example/docs");
  assert.equal(items[0].querySelector(".target").getAttribute("href"), "https://example.com/docs");
  assert.equal(items[0].querySelector(".description").textContent, "Team docs");
});

test("init renders a copy icon button that copies the full alias link to the clipboard", async () => {
  const doc = await setup(
    fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]),
    "https://go.example/"
  );
  const item = doc.querySelector("#link-list .link-item");
  const copyBtn = item.querySelector(".copy-btn");
  assert.equal(copyBtn.getAttribute("aria-label"), "Copy link");

  copyBtn.click();
  await Promise.resolve();

  assert.equal(doc.defaultView.__copiedText, "https://go.example/docs");
  assert.equal(copyBtn.getAttribute("aria-label"), "Copied!");
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
  assert.equal(items[0].querySelector(".alias").textContent, "wiki");
});

test("init prepopulates search from the SEARCH_PARAM= URL param and filters results", async () => {
  const doc = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs" },
      { alias: "wiki", url: "https://example.com/wiki" }
    ]),
    `https://go.example/?${SEARCH_PARAM}=wiki`
  );
  assert.equal(doc.getElementById("search").value, "wiki");
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector(".alias").textContent, "wiki");
});

test("typing into search updates the SEARCH_PARAM= URL param live", async () => {
  const doc = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  const searchInput = doc.getElementById("search");
  searchInput.value = "doc";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  assert.equal(doc.location.search, `?${SEARCH_PARAM}=doc`);
});

test("clearing the search box removes SEARCH_PARAM from the URL", async () => {
  const doc = await setup(
    fakeFetchOk([{ alias: "wiki", url: "https://example.com/wiki" }]),
    `https://go.example/?${SEARCH_PARAM}=wiki`
  );
  const searchInput = doc.getElementById("search");
  searchInput.value = "";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  assert.equal(doc.location.search, "");
  assert.equal(doc.location.href, "https://go.example/");
});

test("the first result is selected immediately after initial load", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(3)));
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].classList.contains("selected"), true);
  assert.equal(items[1].classList.contains("selected"), false);
  assert.equal(items[2].classList.contains("selected"), false);
});

test("the first result is re-selected after typing narrows the list", async () => {
  const doc = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs" },
      { alias: "wiki", url: "https://example.com/wiki" }
    ])
  );
  const searchInput = doc.getElementById("search");
  searchInput.value = "wiki";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 1);
  assert.equal(items[0].classList.contains("selected"), true);
});

test("the empty-results state has no selection", async () => {
  const doc = await setup(fakeFetchOk([]));
  assert.equal(doc.querySelectorAll(".selected").length, 0);
});

test("ArrowDown moves the selection from the first item to the second", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(3)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowDown");

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].classList.contains("selected"), false);
  assert.equal(items[1].classList.contains("selected"), true);
});

test("ArrowUp from the first item on a single page wraps to the last item", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(3)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowUp");

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[2].classList.contains("selected"), true);
  assert.equal(doc.querySelectorAll(".link-item.selected").length, 1);
});

test("ArrowDown on a single page wraps from the last item back to the first", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(3)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowDown"); // -> index 1
  keydown(searchInput, "ArrowDown"); // -> index 2 (last)
  keydown(searchInput, "ArrowDown"); // wraps -> index 0

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].classList.contains("selected"), true);
  assert.equal(doc.querySelectorAll(".link-item.selected").length, 1);
});

test("ArrowDown crosses to the next page and selects its first item", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(11)));
  const searchInput = doc.getElementById("search");
  for (let i = 0; i < 9; i++) keydown(searchInput, "ArrowDown"); // index 0 -> index 9 (last on page 1)
  keydown(searchInput, "ArrowDown"); // crosses to page 2

  assert.match(doc.getElementById("pager").textContent, /Page 2 of 2/);
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector(".alias").textContent, "link-10");
  assert.equal(items[0].classList.contains("selected"), true);
});

test("ArrowDown wraps from the last page back to page 1's first item", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(11)));
  const searchInput = doc.getElementById("search");
  for (let i = 0; i < 9; i++) keydown(searchInput, "ArrowDown");
  keydown(searchInput, "ArrowDown"); // -> page 2, link-10
  keydown(searchInput, "ArrowDown"); // wraps -> page 1, link-0

  assert.match(doc.getElementById("pager").textContent, /Page 1 of 2/);
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].querySelector(".alias").textContent, "link-0");
  assert.equal(items[0].classList.contains("selected"), true);
});

test("ArrowUp crosses backward to the previous page's last item", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(11)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowUp"); // wraps from page 1's link-0 to the last page's last item

  assert.match(doc.getElementById("pager").textContent, /Page 2 of 2/);
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].querySelector(".alias").textContent, "link-10");
  assert.equal(items[0].classList.contains("selected"), true);
});

test("Enter clicks the alias link of the selected item, navigating to its own alias URL", async () => {
  const doc = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs" },
      { alias: "wiki", url: "https://example.com/wiki" }
    ]),
    "https://go.example/"
  );
  const searchInput = doc.getElementById("search");
  let clicked = null;
  doc.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("alias")) clicked = e.target;
  });

  searchInput.value = "wiki";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  keydown(searchInput, "Enter");

  assert.ok(clicked);
  assert.equal(clicked.textContent, "wiki");
  assert.equal(clicked.getAttribute("href"), "https://go.example/wiki");
});

test("selecting a page via a pager button click also selects that page's first item", async () => {
  const doc = await setup(fakeFetchOk(manyLinks(11)));
  const nextBtn = [...doc.querySelectorAll("#pager button")].find((b) => b.textContent === "Next");
  nextBtn.click();

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].querySelector(".alias").textContent, "link-10");
  assert.equal(items[0].classList.contains("selected"), true);
});

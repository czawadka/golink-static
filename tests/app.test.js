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

class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.observedTargets = [];
    FakeIntersectionObserver.instances.push(this);
  }
  observe(target) {
    if (!this.observedTargets.includes(target)) this.observedTargets.push(target);
  }
  unobserve(target) {
    this.observedTargets = this.observedTargets.filter((t) => t !== target);
  }
  disconnect() {
    this.observedTargets = [];
  }
  trigger(isIntersecting = true) {
    const target = this.observedTargets[this.observedTargets.length - 1];
    this.callback([{ target, isIntersecting }], this);
  }
}
FakeIntersectionObserver.instances = [];

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
  await init(dom.window.document, fetchFn, FakeIntersectionObserver);
  const io = FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1];
  return { doc: dom.window.document, io };
}

test("init renders list items from the real index.html markup (guards against ID drift)", async () => {
  const { doc } = await setup(
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
  const { doc } = await setup(
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
  const { doc } = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  const item = doc.querySelector("#link-list .link-item");
  assert.equal(item.querySelector(".description"), null);
});

test("init shows the empty-state message when there are no links", async () => {
  const { doc } = await setup(fakeFetchOk([]));
  const empty = doc.querySelector("#link-list .empty");
  assert.ok(empty);
  assert.equal(empty.textContent, "No links match your search.");
});

test("init shows singular/plural count text correctly", async () => {
  const { doc: one } = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  assert.equal(one.getElementById("count").textContent, "1 link");

  const { doc: two } = await setup(
    fakeFetchOk([
      { alias: "docs", url: "https://example.com/docs" },
      { alias: "wiki", url: "https://example.com/wiki" }
    ])
  );
  assert.equal(two.getElementById("count").textContent, "2 links");
});

test("init shows a fetch failure message instead of the list", async () => {
  const { doc } = await setup(fakeFetchFail(404));
  const empty = doc.querySelector("#link-list .empty");
  assert.ok(empty);
  assert.match(empty.textContent, /Failed to load links\.json: HTTP 404/);
});

test("init renders only the first batch when there are more matches than fit in one batch", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(25)));
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 10);
  assert.equal(doc.getElementById("count").textContent, "25 links");
});

test("triggering the sentinel appends the next batch, and a second trigger appends the rest", async () => {
  const { doc, io } = await setup(fakeFetchOk(manyLinks(25)));
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 10);

  io.trigger();
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 20);

  io.trigger();
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 25);
});

test("triggering the sentinel once everything is already loaded is a no-op", async () => {
  const { doc, io } = await setup(fakeFetchOk(manyLinks(5)));
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 5);

  io.trigger();
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 5);
});

test("searching filters the list", async () => {
  const { doc } = await setup(
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

test("searching after some batches were loaded resets to a fresh single batch", async () => {
  const { doc, io } = await setup(fakeFetchOk(manyLinks(25)));
  io.trigger();
  assert.equal(doc.querySelectorAll("#link-list .link-item").length, 20);

  const searchInput = doc.getElementById("search");
  searchInput.value = "link-2";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 6);
  assert.equal(doc.getElementById("count").textContent, "6 links");
});

test("init prepopulates search from the SEARCH_PARAM= URL param and filters results", async () => {
  const { doc } = await setup(
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
  const { doc } = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  const searchInput = doc.getElementById("search");
  searchInput.value = "doc";
  searchInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  assert.equal(doc.location.search, `?${SEARCH_PARAM}=doc`);
});

test("clearing the search box removes SEARCH_PARAM from the URL", async () => {
  const { doc } = await setup(
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
  const { doc } = await setup(fakeFetchOk(manyLinks(3)));
  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].classList.contains("selected"), true);
  assert.equal(items[1].classList.contains("selected"), false);
  assert.equal(items[2].classList.contains("selected"), false);
});

test("the first result is re-selected after typing narrows the list", async () => {
  const { doc } = await setup(
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
  const { doc } = await setup(fakeFetchOk([]));
  assert.equal(doc.querySelectorAll(".selected").length, 0);
});

test("ArrowDown moves the selection from the first item to the second", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(3)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowDown");

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].classList.contains("selected"), false);
  assert.equal(items[1].classList.contains("selected"), true);
});

test("ArrowUp from the first item wraps to the last item when everything is already loaded", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(3)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowUp");

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[2].classList.contains("selected"), true);
  assert.equal(doc.querySelectorAll(".link-item.selected").length, 1);
});

test("ArrowDown wraps from the last item back to the first when everything is already loaded", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(3)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowDown"); // -> index 1
  keydown(searchInput, "ArrowDown"); // -> index 2 (last)
  keydown(searchInput, "ArrowDown"); // wraps -> index 0

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items[0].classList.contains("selected"), true);
  assert.equal(doc.querySelectorAll(".link-item.selected").length, 1);
});

test("ArrowDown at the last rendered item loads the next batch and selects its first item", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(11)));
  const searchInput = doc.getElementById("search");
  for (let i = 0; i < 9; i++) keydown(searchInput, "ArrowDown"); // index 0 -> index 9 (last rendered)
  keydown(searchInput, "ArrowDown"); // loads the 11th item and selects it

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 11);
  assert.equal(items[10].querySelector(".alias").textContent, "link-10");
  assert.equal(items[10].classList.contains("selected"), true);
});

test("ArrowDown at the true last item wraps to the first item once everything is loaded", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(11)));
  const searchInput = doc.getElementById("search");
  for (let i = 0; i < 10; i++) keydown(searchInput, "ArrowDown"); // reaches & loads the last item
  keydown(searchInput, "ArrowDown"); // wraps

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 11);
  assert.equal(items[0].classList.contains("selected"), true);
});

test("ArrowUp from the first item loads all remaining items and selects the true last item", async () => {
  const { doc } = await setup(fakeFetchOk(manyLinks(11)));
  const searchInput = doc.getElementById("search");
  keydown(searchInput, "ArrowUp");

  const items = doc.querySelectorAll("#link-list .link-item");
  assert.equal(items.length, 11);
  assert.equal(items[10].querySelector(".alias").textContent, "link-10");
  assert.equal(items[10].classList.contains("selected"), true);
});

test("Enter clicks the alias link of the selected item, navigating to its own alias URL", async () => {
  const { doc } = await setup(
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

test("regains focus on the search input when the page is restored from bfcache", async () => {
  const { doc } = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  const searchInput = doc.getElementById("search");
  searchInput.blur();
  assert.notEqual(doc.activeElement, searchInput);

  const event = new doc.defaultView.Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  doc.defaultView.dispatchEvent(event);

  assert.equal(doc.activeElement, searchInput);
});

test("a non-bfcache pageshow does not force focus onto the search input", async () => {
  const { doc } = await setup(fakeFetchOk([{ alias: "docs", url: "https://example.com/docs" }]));
  const searchInput = doc.getElementById("search");
  searchInput.blur();

  const event = new doc.defaultView.Event("pageshow");
  Object.defineProperty(event, "persisted", { value: false });
  doc.defaultView.dispatchEvent(event);

  assert.notEqual(doc.activeElement, searchInput);
});

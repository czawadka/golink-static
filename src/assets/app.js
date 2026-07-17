import { filterLinks, takeBatch } from "./links.js";
import { loadLinks } from "./loader.js";
import { BATCH_SIZE, SEARCH_PARAM } from "./config.js";
import { getParam, setParam } from "./url.js";

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function copyText(win, text) {
  if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
    return win.navigator.clipboard.writeText(text);
  }
  const textarea = win.document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  win.document.body.appendChild(textarea);
  textarea.select();
  win.document.execCommand("copy");
  win.document.body.removeChild(textarea);
  return Promise.resolve();
}

export function init(doc, fetchFn, IntersectionObserverCtor = doc.defaultView.IntersectionObserver) {
  let allLinks = [];
  let query = getParam(doc.location.href, SEARCH_PARAM);
  let filtered = [];
  let loadedCount = 0;
  let hasMore = false;
  let selectedIndex = -1;

  const searchInput = doc.getElementById("search");
  const listEl = doc.getElementById("link-list");
  const sentinelEl = doc.getElementById("scroll-sentinel");
  const countEl = doc.getElementById("count");

  searchInput.value = query;

  function buildItemEl(entry) {
    const li = doc.createElement("li");
    li.className = "link-item";

    const linkRow = doc.createElement("div");
    linkRow.className = "link-row";

    const aliasUrl = new URL(entry.alias, doc.location.href).href;

    const aliasEl = doc.createElement("a");
    aliasEl.className = "alias";
    aliasEl.href = aliasUrl;
    aliasEl.textContent = entry.alias;
    linkRow.appendChild(aliasEl);

    const copyBtn = doc.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.setAttribute("aria-label", "Copy link");
    copyBtn.title = "Copy link";
    copyBtn.addEventListener("click", () => {
      copyText(doc.defaultView, aliasUrl).then(() => {
        copyBtn.innerHTML = CHECK_ICON;
        copyBtn.setAttribute("aria-label", "Copied!");
        copyBtn.title = "Copied!";
        doc.defaultView.setTimeout(() => {
          copyBtn.innerHTML = COPY_ICON;
          copyBtn.setAttribute("aria-label", "Copy link");
          copyBtn.title = "Copy link";
        }, 1500);
      });
    });
    linkRow.appendChild(copyBtn);

    const target = doc.createElement("a");
    target.className = "target";
    target.href = entry.url;
    target.textContent = entry.url;
    linkRow.appendChild(target);

    li.appendChild(linkRow);

    if (entry.description) {
      const desc = doc.createElement("span");
      desc.className = "description";
      desc.textContent = entry.description;
      li.appendChild(desc);
    }

    return li;
  }

  function appendItems(entries) {
    entries.forEach((entry) => listEl.appendChild(buildItemEl(entry)));
  }

  function reobserveSentinel() {
    observer.unobserve(sentinelEl);
    observer.observe(sentinelEl);
  }

  function loadMore(count = BATCH_SIZE) {
    if (!hasMore) return false;
    const result = takeBatch(filtered, loadedCount, count);
    appendItems(result.batch);
    loadedCount = result.nextOffset;
    hasMore = result.hasMore;
    reobserveSentinel();
    return true;
  }

  const observer = new IntersectionObserverCtor(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry && entry.isIntersecting) loadMore();
    },
    { rootMargin: "200px 0px" }
  );

  function render() {
    filtered = filterLinks(allLinks, query);

    listEl.innerHTML = "";
    if (filtered.length === 0) {
      const empty = doc.createElement("li");
      empty.className = "empty";
      empty.textContent = "No links match your search.";
      listEl.appendChild(empty);
    }

    const result = takeBatch(filtered, 0, BATCH_SIZE);
    appendItems(result.batch);
    loadedCount = result.nextOffset;
    hasMore = result.hasMore;

    countEl.textContent = filtered.length + (filtered.length === 1 ? " link" : " links");

    reobserveSentinel();
    selectItem(0);
  }

  function getItemEls() {
    return Array.from(listEl.querySelectorAll(".link-item"));
  }

  function selectItem(index) {
    const items = getItemEls();
    items.forEach((el) => el.classList.remove("selected"));
    if (items.length === 0) {
      selectedIndex = -1;
      return;
    }
    selectedIndex = index;
    const current = items[selectedIndex];
    current.classList.add("selected");
    if (typeof current.scrollIntoView === "function") {
      current.scrollIntoView({ block: "nearest" });
    }
  }

  function moveSelection(delta) {
    const items = getItemEls();
    if (items.length === 0) return;

    const newIndex = selectedIndex + delta;
    if (newIndex >= items.length) {
      if (hasMore) {
        loadMore();
        selectItem(items.length);
      } else {
        selectItem(0);
      }
    } else if (newIndex < 0) {
      loadMore(Infinity);
      selectItem(getItemEls().length - 1);
    } else {
      selectItem(newIndex);
    }
  }

  searchInput.addEventListener("input", (e) => {
    query = e.target.value;
    doc.defaultView.history.replaceState(null, "", setParam(doc.location.href, SEARCH_PARAM, query));
    render();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const items = getItemEls();
      const li = items[selectedIndex];
      const aliasEl = li && li.querySelector(".alias");
      if (aliasEl) aliasEl.click();
    }
  });

  doc.defaultView.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      searchInput.focus();
    }
  });

  return loadLinks(fetchFn, "links.json")
    .then((result) => {
      if (result.ok) {
        allLinks = result.links;
        render();
      } else {
        listEl.innerHTML = "";
        const li = doc.createElement("li");
        li.className = "empty";
        li.textContent = result.message;
        listEl.appendChild(li);
      }
    })
    .catch((err) => {
      // loadLinks() never rejects, but keep a guard here too — this is the
      // exact 404.html lesson (never leave a promise chain unguarded).
      listEl.innerHTML = "";
      const li = doc.createElement("li");
      li.className = "empty";
      li.textContent = `Failed to load links.json: ${err.message}`;
      listEl.appendChild(li);
    });
}

if (typeof document !== "undefined") {
  init(document, fetch);
}

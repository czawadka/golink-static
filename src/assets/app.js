import { filterLinks, paginate } from "./links.js";
import { pagerState } from "./pager.js";
import { loadLinks } from "./loader.js";
import { PAGE_SIZE, SEARCH_PARAM } from "./config.js";
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

export function init(doc, fetchFn) {
  let allLinks = [];
  let query = getParam(doc.location.href, SEARCH_PARAM);
  let page = 1;

  const searchInput = doc.getElementById("search");
  const listEl = doc.getElementById("link-list");
  const pagerEl = doc.getElementById("pager");
  const countEl = doc.getElementById("count");

  searchInput.value = query;

  function render() {
    const visible = filterLinks(allLinks, query);
    const paginated = paginate(visible, page, PAGE_SIZE);
    page = paginated.page;
    const pageItems = paginated.pageItems;
    const pager = pagerState(page, paginated.totalPages);

    listEl.innerHTML = "";
    if (pageItems.length === 0) {
      const empty = doc.createElement("li");
      empty.className = "empty";
      empty.textContent = "No links match your search.";
      listEl.appendChild(empty);
    }
    pageItems.forEach((entry) => {
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
      listEl.appendChild(li);
    });

    countEl.textContent = visible.length + (visible.length === 1 ? " link" : " links");

    pagerEl.innerHTML = "";
    if (pager.totalPages > 1) {
      const prev = doc.createElement("button");
      prev.type = "button";
      prev.textContent = "Prev";
      prev.disabled = pager.prevDisabled;
      prev.addEventListener("click", () => {
        page = pager.prevPage;
        render();
      });

      const next = doc.createElement("button");
      next.type = "button";
      next.textContent = "Next";
      next.disabled = pager.nextDisabled;
      next.addEventListener("click", () => {
        page = pager.nextPage;
        render();
      });

      const label = doc.createElement("span");
      label.className = "page-label";
      label.textContent = pager.label;

      pagerEl.appendChild(prev);
      pagerEl.appendChild(label);
      pagerEl.appendChild(next);
    }
  }

  searchInput.addEventListener("input", (e) => {
    query = e.target.value;
    page = 1;
    doc.defaultView.history.replaceState(null, "", setParam(doc.location.href, SEARCH_PARAM, query));
    render();
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

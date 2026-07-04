import { filterLinks, paginate } from "./links.js";
import { pagerState } from "./pager.js";
import { loadLinks } from "./loader.js";
import { PAGE_SIZE } from "./config.js";

export function init(doc, fetchFn) {
  let allLinks = [];
  let query = "";
  let page = 1;

  const searchInput = doc.getElementById("search");
  const listEl = doc.getElementById("link-list");
  const pagerEl = doc.getElementById("pager");
  const countEl = doc.getElementById("count");

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

      const a = doc.createElement("a");
      a.href = entry.url;
      a.textContent = entry.alias;
      li.appendChild(a);

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

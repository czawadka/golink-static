import { filterLinks } from "./links.js";
import { PAGE_SIZE } from "./config.js";

let allLinks = [];
let query = "";
let page = 1;

const searchInput = document.getElementById("search");
const listEl = document.getElementById("link-list");
const pagerEl = document.getElementById("pager");
const countEl = document.getElementById("count");

function render() {
  const visible = filterLinks(allLinks, query);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  const start = (page - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  listEl.innerHTML = "";
  if (pageItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No links match your search.";
    listEl.appendChild(empty);
  }
  pageItems.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "link-item";

    const a = document.createElement("a");
    a.href = entry.url;
    a.textContent = entry.alias;
    li.appendChild(a);

    if (entry.description) {
      const desc = document.createElement("span");
      desc.className = "description";
      desc.textContent = entry.description;
      li.appendChild(desc);
    }
    listEl.appendChild(li);
  });

  countEl.textContent = visible.length + (visible.length === 1 ? " link" : " links");

  pagerEl.innerHTML = "";
  if (totalPages > 1) {
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Prev";
    prev.disabled = page <= 1;
    prev.addEventListener("click", () => {
      page -= 1;
      render();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = page >= totalPages;
    next.addEventListener("click", () => {
      page += 1;
      render();
    });

    const label = document.createElement("span");
    label.className = "page-label";
    label.textContent = `Page ${page} of ${totalPages}`;

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

fetch("links.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    allLinks = data;
    render();
  })
  .catch((err) => {
    listEl.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = `Failed to load links.json: ${err.message}`;
    listEl.appendChild(li);
  });

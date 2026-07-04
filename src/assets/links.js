export function aliasFromPath(pathname, basePrefix) {
  let path = pathname;
  if (basePrefix && path.indexOf(basePrefix) === 0) {
    path = path.slice(basePrefix.length);
  }
  path = path.replace(/^\/+|\/+$/g, "");
  try {
    return decodeURIComponent(path);
  } catch (e) {
    return path;
  }
}

export function findByAlias(links, alias) {
  const needle = alias.toLowerCase();
  return links.find((entry) => entry.alias.toLowerCase() === needle);
}

export function filterLinks(links, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return links;
  return links.filter((entry) => {
    const alias = (entry.alias || "").toLowerCase();
    const description = (entry.description || "").toLowerCase();
    return alias.includes(q) || description.includes(q);
  });
}

export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: clampedPage,
    totalPages
  };
}

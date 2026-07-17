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

export function resolveAlias(links, alias, origin, basePrefix) {
  const visited = new Set();
  let current = alias;

  while (true) {
    const key = current.toLowerCase();
    if (visited.has(key)) return null;
    visited.add(key);

    const entry = findByAlias(links, current);
    if (!entry) return null;

    let target;
    try {
      target = new URL(entry.url, origin);
    } catch (e) {
      return entry;
    }

    if (target.origin !== origin) return entry;

    const nextAlias = aliasFromPath(target.pathname, basePrefix);
    if (!nextAlias) return entry;

    current = nextAlias;
  }
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

export function takeBatch(items, offset, count) {
  const start = Math.min(Math.max(offset, 0), items.length);
  const end = Math.min(items.length, start + count);
  return {
    batch: items.slice(start, end),
    nextOffset: end,
    hasMore: end < items.length
  };
}

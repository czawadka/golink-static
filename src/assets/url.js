export function getParam(href, key) {
  return new URL(href).searchParams.get(key) || "";
}

export function setParam(href, key, value) {
  const url = new URL(href);
  if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }
  return url.pathname + url.search + url.hash;
}

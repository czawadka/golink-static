export function loadLinks(fetchFn, url) {
  return fetchFn(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then((links) => ({ ok: true, links }))
    .catch((err) => ({
      ok: false,
      message: `Failed to load ${url}: ${err.message}`
    }));
}

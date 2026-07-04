export function pagerState(page, totalPages) {
  return {
    page,
    totalPages,
    prevDisabled: page <= 1,
    nextDisabled: page >= totalPages,
    label: `Page ${page} of ${totalPages}`,
    prevPage: Math.max(1, page - 1),
    nextPage: Math.min(totalPages, page + 1)
  };
}

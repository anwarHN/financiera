export async function fetchAllPages(buildPageQuery, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildPageQuery(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (!batch.length) return rows;
    // Advance by returned rows even when the server caps pages below pageSize.
    from += batch.length;
  }
}

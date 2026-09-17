/*
 * Inventory filtering/sorting worker. The renderer sends a compact item projection once
 * per character/view; this worker keeps a small query-result cache until that projection
 * changes. Returning source indexes keeps the renderer's actual item objects untouched.
 */
let items = [];
let queryCache = new Map();

function compare(a, b, criteria) {
  for (let i = 0; i < criteria.length; i++) {
    const criterion = criteria[i];
    const key = criterion.key;
    let result = 0;
    if (key === 'count' || key === 'cost') result = (a[key] || 0) - (b[key] || 0);
    else if (key === 'bank') result = Number(!!a.bank) - Number(!!b.bank);
    else if (key === 'added') result = (a.addedAt || 0) - (b.addedAt || 0);
    else if (key === 'inserted') result = (a.insertedAt || 0) - (b.insertedAt || 0);
    else result = String(a[key === 'name' ? 'sortName' : key] || '').localeCompare(String(b[key === 'name' ? 'sortName' : key] || ''), undefined, { numeric: true, sensitivity: 'base' });
    if (result) return criterion.direction === 'asc' ? result : -result;
  }
  return a.sourceIndex - b.sourceIndex;
}

self.onmessage = function (event) {
  const message = event.data || {};
  if (message.type === 'setItems') {
    items = message.items || [];
    queryCache = new Map();
    return;
  }
  if (message.type !== 'query') return;
  const query = message.query || {};
  const cacheKey = JSON.stringify(query);
  let indexes = queryCache.get(cacheKey);
  if (!indexes) {
    const labelIds = query.labelIds || [];
    indexes = items.filter((item) => {
      if (query.name && item.searchName.indexOf(query.name) === -1) return false;
      if (query.itemType !== 'all' && item.type !== query.itemType) return false;
      if (labelIds.length && !item.labelIds.some((id) => labelIds.indexOf(id) !== -1)) return false;
      if (query.inventory) {
        if (query.location === 'bank' && !item.bank) return false;
        if (query.location === 'inventory' && item.bank) return false;
        if (query.member === 'member' && !item.member) return false;
        if (query.member === 'nonmember' && item.member) return false;
        if (query.coins === 'ac' && !item.coins) return false;
        if (query.coins === 'nonac' && item.coins) return false;
      }
      return true;
    }).sort((a, b) => compare(a, b, query.sortCriteria || [])).map((item) => item.sourceIndex);
    queryCache.set(cacheKey, indexes);
  }
  self.postMessage({ type: 'result', requestId: message.requestId, indexes: indexes });
};

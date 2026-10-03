import db from '../db/database.js';

/**
 * Look up a GSTIN in the local cache.
 * Returns the cache row or null if not found.
 */
export function getCachedGstin(gstin) {
  return db.prepare('SELECT * FROM gstin_cache WHERE gstin = ?').get(gstin) || null;
}

/**
 * Insert or update a GSTIN's details in the local cache.
 * source: 'gsp' | 'user' | 'manual'
 */
export function upsertGstinCache(gstin, data, source = 'gsp') {
  db.prepare(`
    INSERT INTO gstin_cache (gstin, trade_name, addr1, addr2, place, pincode, state_code, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(gstin) DO UPDATE SET
      trade_name = excluded.trade_name,
      addr1      = excluded.addr1,
      addr2      = excluded.addr2,
      place      = excluded.place,
      pincode    = excluded.pincode,
      state_code = excluded.state_code,
      source     = excluded.source,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    gstin,
    data.tradeName  || data.trade_name || '',
    data.addr1      || '',
    data.addr2      || '',
    data.place      || '',
    data.pincode    || '',
    data.stateCode  || data.state_code || String(gstin).slice(0, 2),
    source
  );
}

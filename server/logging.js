const safeCodes = new Set([
  '42P01', '42703', '23505', '23503', '23514', '23502', '40001', '40P01',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '53300',
  'DATABASE_NOT_CONFIGURED', 'DATABASE_SCHEMA_NOT_READY', 'DATABASE_SCHEMA_INCOMPATIBLE',
  'MIGRATION_CHECKSUM_MISMATCH', 'PROXY_INVALIDO'
]);

export function logFailure(logger, event, error, requestId) {
  logger.error(JSON.stringify({ event, code: safeCodes.has(error?.code) ? error.code : 'INTERNAL',
    ...(requestId ? { requestId } : {}) }));
}

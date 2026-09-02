/**
 * Hermetic Test Runner for Server Actions Suite.
 * Establishes an in-memory SQLite database (:memory:) BEFORE any db-dependent module is loaded,
 * guaranteeing that tests NEVER touch data/tradelog.db.
 */
process.env.TRADELOG_DB_PATH = ':memory:';

async function main() {
  console.log('🚀 Bootstrapping hermetic test environment (TRADELOG_DB_PATH = :memory:)...');
  const { runActionsSuiteTests } = await import('./actions-suite.test');
  await runActionsSuiteTests();
}

main().catch((err) => {
  console.error('[ACTIONS RUNNER ERROR]', err);
  process.exit(1);
});

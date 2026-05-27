const cron = require('node-cron');
const dashboardService = require('../services/DashboardService');

function startBatchJobs() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    await dashboardService.runBatch();
  });

  console.log('[BatchJob] Dashboard snapshot job scheduled (hourly).');

  // Run once on startup so dashboard has data immediately
  dashboardService.runBatch().catch((err) =>
    console.error('[BatchJob] Initial snapshot failed:', err.message),
  );
}

module.exports = { startBatchJobs };

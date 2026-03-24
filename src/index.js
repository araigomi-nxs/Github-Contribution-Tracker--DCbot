require('dotenv/config');
const express = require('express');
const { createHmac, timingSafeEqual } = require('crypto');
const { initializeDiscordBot, sendWebhookMessage } = require('./discord/bot');
const { handleGitHubWebhook } = require('./github/webhookHandler');
const { fetchRecentCommits, fetchContributionGraph } = require('./github/contributionGraphGenerator');
const { getUser, getAllUsers, updateLastSyncTime, getLastSyncTime, updateLastCommitHash, getLastCommitHash } = require('./storage/userStorage');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Verify GitHub webhook signature (for per-user webhooks)
const verifyWebhookSignaturePerUser = (req, res, next) => {
  const signature = req.headers['x-hub-signature-256'];
  const userId = req.params.userId;

  if (!signature) {
    console.warn('Missing webhook signature');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const user = getUser(userId);
  if (!user) {
    console.warn(`User not found: ${userId}`);
    return res.status(404).json({ error: 'User not found' });
  }

  const hmac = createHmac('sha256', user.webhookSecret);
  const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

  try {
    if (!timingSafeEqual(signature, digest)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  req.userId = userId;
  next();
};

// Routes
app.post('/webhook/github/:userId', verifyWebhookSignaturePerUser, async (req, res) => {
  try {
    await handleGitHubWebhook(req.body, req.userId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Auto-refresh recent commits job
const startAutoRefreshJob = () => {
  // Run every 5 minutes
  const REFRESH_INTERVAL = 5 * 60 * 1000;

  setInterval(async () => {
    try {
      const users = getAllUsers();
      console.log(`\n⏰ Auto-refresh job running at ${new Date().toISOString()} - checking ${Object.keys(users).length} users`);

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (const [userId, user] of Object.entries(users)) {
        try {
          console.log(`\n  👤 Processing ${user.githubUsername}...`);

          // Fetch recent commits from last 3 days to always have available commits
          const recentCommits = await fetchRecentCommits(user.githubUsername, user.githubToken, 3);

          if (recentCommits.length === 0) {
            console.log(`  ✓ No commits found for ${user.githubUsername}`);
            skipCount++;
            continue;
          }

          console.log(`  📊 Found ${recentCommits.length} commits in last 3 days`);

          // Get only the latest commit
          const latestCommit = recentCommits[0];
          console.log(`  💾 Latest: ${latestCommit.shortHash} - "${latestCommit.message}"`);

          // Check if this commit has already been sent
          const lastSentHash = getLastCommitHash(userId);
          if (lastSentHash === latestCommit.oid) {
            console.log(`  ⏭️  Skipping duplicate commit: ${latestCommit.oid.substring(0, 7)}`);
            skipCount++;
            continue;
          }

          console.log(`  🔄 New commit detected! Last sent: ${lastSentHash ? lastSentHash.substring(0, 7) : 'none'}`);

          // Fetch and add heatmap
          console.log(`  📈 Fetching contribution graph...`);
          const graphData = await fetchContributionGraph(
            user.githubUsername,
            user.githubToken
          );

          const commitMessage = `• [\`${latestCommit.shortHash}\`](${latestCommit.repoUrl}/commit/${latestCommit.shortHash}) ${latestCommit.message} - **${latestCommit.repo}**`;

          const description = `**Latest Commit**\n\n${commitMessage}`;
          const title = `📝 Latest Commit`;

          console.log(`  📤 Sending Discord message...`);
          
          await sendWebhookMessage(
            userId,
            title,
            description,
            user.githubUsername,
            `https://github.com/${user.githubUsername}`,
            null, // No text graph for auto-refresh
            graphData.pngBuffer, // Include heatmap image as PNG buffer
            user.githubUsername
          );

          // Update last sync time and commit hash
          await updateLastSyncTime(userId);
          await updateLastCommitHash(userId, latestCommit.oid);

          successCount++;
          console.log(`  ✅ Sent latest commit for ${user.githubUsername}: ${latestCommit.oid.substring(0, 7)}`);  
        } catch (userError) {
          errorCount++;
          console.error(`  ❌ Error syncing user ${userId}:`, userError.message);
        }
      }

      console.log(`\n✓ Auto-refresh job completed at ${new Date().toISOString()}`);
      console.log(`  📊 Results: ${successCount} sent, ${skipCount} skipped, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Auto-refresh job error:', error);
    }
  }, REFRESH_INTERVAL);

  console.log('✓ Auto-refresh job started (checks every 5 minutes)');
};

// Daily contribution graph job (sends at 6am UTC+8 = 22:00 UTC)
const startDailyGraphJob = () => {
  // Calculate time until next 6am UTC+8 (22:00 UTC)
  const calculateTimeUntilNextRun = () => {
    const now = new Date();
    const currentUTC = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    
    // Target: 22:00 UTC (6am UTC+8)
    const target = new Date(currentUTC);
    target.setUTCHours(22, 0, 0, 0);
    
    // If we've already passed 22:00 UTC today, schedule for tomorrow
    if (currentUTC >= target) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    
    const msUntilRun = target - currentUTC;
    return msUntilRun;
  };

  const runDailyGraph = async () => {
    try {
      const users = getAllUsers();
      const runTime = new Date().toISOString();

      console.log(`\n📊 Daily contribution graph job started at ${runTime}`);

      for (const [userId, user] of Object.entries(users)) {
        try {
          // Fetch contribution graph
          const graphData = await fetchContributionGraph(
            user.githubUsername,
            user.githubToken
          );

          if (!graphData || !graphData.pngBuffer) {
            console.log(`⚠️  No graph data for ${user.githubUsername}`);
            continue;
          }

          const description = `**Daily Contribution Summary**\n\n${graphData.dateRange}\n\n_Sent daily at 6am UTC+8_`;
          const title = `📈 Daily Contributions`;

          await sendWebhookMessage(
            userId,
            title,
            description,
            user.githubUsername,
            `https://github.com/${user.githubUsername}`,
            null,
            graphData.pngBuffer,
            user.githubUsername
          );

          console.log(`✓ Sent daily graph for ${user.githubUsername}`);
        } catch (userError) {
          console.error(`Error sending daily graph to user ${userId}:`, userError);
        }
      }

      console.log(`✓ Daily graph job completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Daily graph job error:', error);
    }

    // Schedule next run (24 hours later)
    setTimeout(runDailyGraph, 24 * 60 * 60 * 1000);
  };

  // Schedule first run
  const msUntilFirstRun = calculateTimeUntilNextRun();
  const firstRunTime = new Date(Date.now() + msUntilFirstRun);

  console.log(`✓ Daily graph job scheduled for ${firstRunTime.toISOString()} (in ${Math.round(msUntilFirstRun / 1000 / 60)} minutes at 6am UTC+8)`);
  
  setTimeout(runDailyGraph, msUntilFirstRun);
};

// Initialize Discord bot
initializeDiscordBot();

// Start auto-refresh job
startAutoRefreshJob();

// Start daily graph job
startDailyGraphJob();

// Start server
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Webhook URL: http://localhost:${PORT}/webhook/github`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

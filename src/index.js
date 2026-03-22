require('dotenv/config');
const express = require('express');
const { createHmac, timingSafeEqual } = require('crypto');
const { initializeDiscordBot, sendWebhookMessage } = require('./discord/bot');
const { handleGitHubWebhook } = require('./github/webhookHandler');
const { fetchRecentCommits } = require('./github/contributionGraphGenerator');
const { getUser, getAllUsers, updateLastSyncTime, getLastSyncTime } = require('./storage/userStorage');

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

      for (const [userId, user] of Object.entries(users)) {
        try {
          const recentCommits = await fetchRecentCommits(user.githubUsername, user.githubToken, 1); // Last 1 day

          if (recentCommits.length === 0) {
            continue;
          }

          // Format commits for Discord
          const commitMessages = recentCommits
            .slice(0, 5) // Show top 5 commits
            .map((commit) => `• [\`${commit.shortHash}\`](${commit.repoUrl}/commit/${commit.shortHash}) ${commit.message} - **${commit.repo}**`)
            .join('\n');

          const description = `**Recent Commits (Last 24 Hours)**\n\n${commitMessages}`;
          const title = `📝 ${recentCommits.length} New Commit${recentCommits.length > 1 ? 's' : ''}`;

          // Send to Discord
          await sendWebhookMessage(
            userId,
            title,
            description,
            user.githubUsername,
            `https://github.com/${user.githubUsername}`,
            null, // No text graph
            null  // No image
          );

          // Update last sync time
          await updateLastSyncTime(userId);
        } catch (userError) {
          console.error(`Error syncing user ${userId}:`, userError);
        }
      }

      console.log(`✓ Auto-refresh job completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Auto-refresh job error:', error);
    }
  }, REFRESH_INTERVAL);

  console.log('✓ Auto-refresh job started (checks every 5 minutes)');
};

// Initialize Discord bot
initializeDiscordBot();

// Start auto-refresh job
startAutoRefreshJob();

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

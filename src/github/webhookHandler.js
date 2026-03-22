const { sendWebhookMessage } = require('../discord/bot');
const { fetchContributionGraph } = require('./contributionGraphGenerator');
const { getUser } = require('../storage/userStorage');

const handleGitHubWebhook = async (payload, userId) => {
  const user = getUser(userId);
  if (!user) {
    console.error(`User not found: ${userId}`);
    return;
  }

  const eventType = payload.action || (payload.commits ? 'push' : 'unknown');

  console.log(`\n📡 Received GitHub webhook for ${user.githubUsername}: ${eventType}`);

  if (eventType === 'push' && payload.commits && payload.commits.length > 0) {
    await handlePushEvent(payload, userId, user);
  } else if (eventType === 'pull_request') {
    await handlePullRequestEvent(payload, userId, user);
  } else if (eventType === 'issues') {
    await handleIssueEvent(payload, userId, user);
  }
};

const handlePushEvent = async (payload, userId, user) => {
  const { commits, repository, pusher } = payload;
  const totalCommits = commits.length;
  const lastCommit = commits[commits.length - 1];

  // Get contribution graph with image
  const graphData = await fetchContributionGraph(user.githubUsername, user.githubToken);

  const commitMessages = commits
    .map((c) => `• \`${c.id.substring(0, 7)}\` ${c.message}`)
    .join('\n');

  const description = `**Contributor:** ${pusher.name}\n**Repository:** [${repository.name}](${repository.html_url})\n**Commits:** ${totalCommits}\n\n${commitMessages}`;

  const title = `📝 ${totalCommits} Commit${totalCommits > 1 ? 's' : ''} Pushed`;

  await sendWebhookMessage(userId, title, description, pusher.name, lastCommit.url, graphData.textGraph, graphData.imageUrl);
};

const handlePullRequestEvent = async (payload, userId, user) => {
  const { action, pull_request, repository } = payload;

  if (action !== 'opened' && action !== 'closed' && action !== 'synchronize') {
    return;
  }

  const graphData = await fetchContributionGraph(user.githubUsername, user.githubToken);

  const status = action === 'opened' ? '🔓 Opened' : action === 'closed' ? '✅ Closed' : '🔄 Updated';

  const description = `**Action:** ${status}\n**Repository:** [${repository.name}](${repository.html_url})\n**PR:** [${pull_request.title}](${pull_request.html_url})\n**Author:** ${pull_request.user.login}`;

  await sendWebhookMessage(userId, `${status} Pull Request`, description, pull_request.user.login, pull_request.html_url, graphData.textGraph, graphData.imageUrl);
};

const handleIssueEvent = async (payload, userId, user) => {
  const { action, issue, repository } = payload;

  if (action !== 'opened' && action !== 'closed') {
    return;
  }

  const graphData = await fetchContributionGraph(user.githubUsername, user.githubToken);

  const status = action === 'opened' ? '❗ Opened' : '✅ Closed';

  const description = `**Action:** ${status}\n**Repository:** [${repository.name}](${repository.html_url})\n**Issue:** [${issue.title}](${issue.html_url})\n**Author:** ${issue.user.login}`;

  await sendWebhookMessage(userId, `${status} Issue`, description, issue.user.login, issue.html_url, graphData.textGraph, graphData.imageUrl);
};

module.exports = {
  handleGitHubWebhook,
};

/**
 * Diagnostic script to test if commits are being found
 * Usage: node test-commits.js <github-username> <github-token>
 */

require('dotenv/config');
const { fetchRecentCommits, fetchContributionGraph } = require('./src/github/contributionGraphGenerator');

async function testCommitFetching(username, token) {
  console.log(`\n🧪 Testing commit fetching for @${username}\n`);

  try {
    // Test 1: Fetch recent commits from last 7 days
    console.log('📋 Test 1: Fetching commits from last 7 days...');
    const commits7d = await fetchRecentCommits(username, token, 7);
    console.log(`✅ Found ${commits7d.length} commits in last 7 days\n`);

    if (commits7d.length > 0) {
      console.log('Top 5 recent commits:');
      commits7d.slice(0, 5).forEach((commit, i) => {
        console.log(`  ${i + 1}. [${commit.shortHash}] ${commit.message} (${commit.repo}) - ${new Date(commit.date).toLocaleString()}`);
      });
    } else {
      console.log('⚠️  No commits found! Possible reasons:');
      console.log('  • GitHub token is invalid or expired');
      console.log('  • Username is incorrect');
      console.log('  • No commits in last 7 days');
      console.log('  • All repositories are archived');
    }

    // Test 2: Fetch recent commits from last 3 days (what auto-refresh uses)
    console.log('\n📋 Test 2: Fetching commits from last 3 days (auto-refresh interval)...');
    const commits3d = await fetchRecentCommits(username, token, 3);
    console.log(`✅ Found ${commits3d.length} commits in last 3 days\n`);

    if (commits3d.length === 0) {
      console.log('⚠️  No commits in last 3 days. Auto-refresh will not send messages.');
      console.log('   This is normal if you haven\'t committed recently.');
    }

    // Test 3: Fetch contribution graph
    console.log('\n📋 Test 3: Fetching contribution graph...');
    const graphData = await fetchContributionGraph(username, token);
    console.log(`✅ Contribution graph fetched`);
    console.log(`   • Contributions in last 6 months: ${graphData.contributionCount}`);
    console.log(`   • Date range: ${graphData.dateRange}`);
    console.log(`   • PNG buffer: ${graphData.pngBuffer ? `${graphData.pngBuffer.length} bytes` : 'null'}`);

    if (!graphData.pngBuffer) {
      console.log('\n⚠️  Warning: PNG buffer is null. This could cause message sending to fail.');
    }

    // Test 4: Check if lastCommitHash matches
    console.log('\n📋 Test 4: Checking commit tracking...');
    if (commits7d.length > 0) {
      const latestCommit = commits7d[0];
      console.log(`✅ Latest commit hash: ${latestCommit.oid}`);
      console.log(`   Full hash: ${latestCommit.oid}`);
      console.log(`   Short hash: ${latestCommit.shortHash}`);
    }

    console.log('\n✅ All tests completed!\n');

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

// Get credentials from command line or environment
const username = process.argv[2] || process.env.GITHUB_USERNAME;
const token = process.argv[3] || process.env.GITHUB_TOKEN;

if (!username || !token) {
  console.error('❌ Missing credentials!');
  console.error('\nUsage:');
  console.error('  node test-commits.js <username> <token>');
  console.error('\nOr set environment variables:');
  console.error('  GITHUB_USERNAME=<username>');
  console.error('  GITHUB_TOKEN=<token>');
  process.exit(1);
}

testCommitFetching(username, token);

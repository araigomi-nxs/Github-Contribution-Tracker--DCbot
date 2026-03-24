const axios = require('axios');
const { generateContributionHeatmapPNG, generateContributionHeatmapSVG, svgToDataUri } = require('./chartRenderer');

/**
 * Generate contribution chart image locally as PNG (GitHub-style heatmap)
 * No external APIs needed - completely self-contained
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data
 * @returns {Promise<Object>} { png: Buffer, svg: string }
 */
const generateLocalChartImage = async (username, contributionMap) => {
  if (contributionMap.size === 0) {
    console.warn(`⚠️ No contribution data for ${username}`);
    return null;
  }

  try {
    console.log(`🎨 Generating contribution heatmap for ${username} with ${contributionMap.size} contribution days`);
    
    // Generate chart as PNG heatmap (GitHub-style grid)
    const chartData = await generateContributionHeatmapPNG(username, contributionMap);
    
    if (!chartData || !chartData.png) {
      console.error('❌ Failed to generate contribution heatmap PNG');
      return null;
    }

    console.log(`✅ Heatmap generated successfully (${chartData.png.length} bytes)`);
    
    return chartData;  // Returns { png: Buffer, svg: string }
    
  } catch (error) {
    console.error(`❌ Error generating local chart: ${error.message}`);
    return null;
  }
};



const parseGitHubContributions = async (username, token) => {
  try {
    const contributionMap = new Map();

    if (!token) {
      console.warn('⚠️ No GitHub token provided');
      return contributionMap;
    }

    console.log(`🔗 Fetching contributions for @${username}...`);

    // Calculate date range: 6 months ago to today (includes private contributions)
    const newestDate = new Date();
    const cutoffDate = new Date(newestDate);
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    
    const fromDate = cutoffDate.toISOString();
    const toDate = newestDate.toISOString();

    // GraphQL query to fetch contributions including private contributions
    const query = `
      query {
        user(login: "${username}") {
          contributionsCollection(from: "${fromDate}", to: "${toDate}") {
            contributionCalendar {
              isHalloween
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      'https://api.github.com/graphql',
      { query },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      console.error('❌ GraphQL error:', response.data.errors);
      return contributionMap;
    }

    // Parse the contribution calendar
    const weeks = response.data.data?.user?.contributionsCollection?.contributionCalendar?.weeks || [];
    
    // Convert cutoffDate to YYYY-MM-DD format for filtering
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        // Store ALL days from last 6 months (including zero contributions)
        if (day.date >= cutoffDateStr) {
          contributionMap.set(day.date, day.contributionCount);
        }
      });
    });

    return contributionMap;
  } catch (error) {
    console.error('❌ Error parsing GitHub contributions:', error.message);
    return new Map();
  }
};

/**
 * Generate contribution heatmap as PNG image (locally, no external APIs)
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data
 * @returns {Promise<Object>} { pngBuffer: Buffer, dateRange: string }
 */
const generateHeatmapImageUrl = async (username, contributionMap) => {
  try {
    if (contributionMap.size === 0) {
      console.warn(`⚠️ No contribution data for ${username}`);
      return { pngBuffer: null, dateRange: 'No contributions found in last 6 months' };
    }

    // Generate chart locally (no external API calls)
    const chartData = await generateLocalChartImage(username, contributionMap);
    
    if (!chartData || !chartData.png) {
      console.warn(`⚠️ Failed to generate PNG for ${username}`);
      return { pngBuffer: null, dateRange: 'Failed to generate chart' };
    }
    
    // Format date range
    const sortedDates = Array.from(contributionMap.keys()).sort();
    const firstDate = new Date(sortedDates[0]);
    const lastDate = new Date(sortedDates[sortedDates.length - 1]);
    const formattedDateRange = `${firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} - ${lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}`;
    
    console.log(`✅ Heatmap & date range ready for @${username}`);
    
    return { 
      pngBuffer: chartData.png,  // PNG image buffer
      dateRange: formattedDateRange
    };
  } catch (error) {
    console.error(`❌ Error generating heatmap: ${error.message}`);
    return { pngBuffer: null, dateRange: 'Error generating heatmap' };
  }
};

/**
 * Generate a text-based contribution graph
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data
 * @returns {string} Text-based contribution graph
 */
const generateTextGraph = (username, contributionMap) => {
  try {
    if (contributionMap.size === 0) {
      return `📊 No recent contributions found for **${username}**`;
    }

    const contributionArray = Array.from(contributionMap.values()).sort((a, b) => b - a);
    const maxContributions = contributionArray[0] || 1;

    let graph = `\`\`\`\nContribution Graph for ${username}\n`;
    graph += `Total entries: ${contributionMap.size}\n\n`;

    const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    for (let i = 0; i < Math.min(7, contributionArray.length); i++) {
      const count = contributionArray[i];
      const barIndex = Math.floor((count / maxContributions) * (bars.length - 1));
      const bar = bars[barIndex];
      graph += `${bar.repeat(count)} ${count} commits\n`;
    }

    graph += '\`\`\`';
    return graph;
  } catch (error) {
    console.error('Error generating text graph:', error);
    return 'Error generating contribution graph';
  }
};

/**
 * Download image from QuickChart and return as buffer
 * @param {string} imageUrl - QuickChart URL
 * @returns {Promise<Buffer|null>} Image buffer or null
 */
const downloadHeatmapImage = async (imageUrl) => {
  try {
    if (!imageUrl) return null;

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
    });

    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error downloading heatmap image:', error);
    return null;
  }
};

/**
 * Fetch recent commits from user's public repositories
 * @param {string} username - GitHub username
 * @param {string} token - GitHub personal access token
 * @param {number} limitDays - Only return commits from last N days
 * @returns {Promise<Array>} Array of recent commits
 */
const fetchRecentCommits = async (username, token, limitDays = 7) => {
  try {
    if (!token) {
      console.warn('No GitHub token provided');
      return [];
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - limitDays);
    const sinceISO = sinceDate.toISOString();

    // GraphQL query to fetch recent commits
    const query = `
      query {
        user(login: "${username}") {
          repositories(first: 100, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
            nodes {
              name
              url
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 10) {
                      edges {
                        node {
                          oid
                          message
                          committedDate
                          author {
                            name
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      'https://api.github.com/graphql',
      { query },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      console.error('GraphQL error:', response.data.errors);
      return [];
    }

    const commits = [];
    const repos = response.data.data?.user?.repositories?.nodes || [];

    repos.forEach((repo) => {
      const history = repo.defaultBranchRef?.target?.history?.edges || [];
      history.forEach((edge) => {
        const commit = edge.node;
        const commitDate = new Date(commit.committedDate);
        
        if (commitDate >= sinceDate) {
          commits.push({
            repo: repo.name,
            repoUrl: repo.url,
            message: commit.message.split('\n')[0], // First line only
            oid: commit.oid, // Full commit hash for deduplication
            shortHash: commit.oid.substring(0, 7),
            date: commit.committedDate,
            author: commit.author?.name || 'Unknown',
          });
        }
      });
    });

    // Sort by date descending
    return commits.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('Error fetching recent commits:', error);
    return [];
  }
};

/**
 * Fetch contribution graph data with locally generated PNG chart
 * @param {string} username - GitHub username
 * @param {string} token - GitHub personal access token
 * @returns {Promise<Object>} Object with PNG buffer, metadata, and contribution map
 */
const fetchContributionGraph = async (username, token) => {
  try {
    console.log(`📊 fetchContributionGraph called for @${username}`);
    const contributionMap = await parseGitHubContributions(username, token);

    const textGraph = generateTextGraph(username, contributionMap);
    const heatmapData = await generateHeatmapImageUrl(username, contributionMap);

    console.log(`✅ fetchContributionGraph complete: ${contributionMap.size} contributions, PNG: ${heatmapData.pngBuffer ? 'generated' : 'null'}`);

    return {
      textGraph,
      pngBuffer: heatmapData.pngBuffer,  // PNG image buffer
      dateRange: heatmapData.dateRange,
      contributionCount: contributionMap.size,
      contributionMap,  // Include the map for additional processing
    };
  } catch (error) {
    console.error('❌ Error fetching contribution graph:', error);
    return {
      textGraph: 'Error generating contribution graph',
      pngBuffer: null,
      dateRange: '',
      contributionCount: 0,
      contributionMap: new Map(),
    };
  }
};

module.exports = {
  fetchContributionGraph,
  generateTextGraph,
  generateHeatmapImageUrl,
  downloadHeatmapImage,
  fetchRecentCommits,
};

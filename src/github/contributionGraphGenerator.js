const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Parse GitHub contributions for a user using GraphQL API
 * @param {string} username - GitHub username
 * @param {string} token - GitHub personal access token
 * @returns {Promise<Map<string, number>>} Contribution data map
 */
const parseGitHubContributions = async (username, token) => {
  try {
    const contributionMap = new Map();

    if (!token) {
      console.warn('No GitHub token provided');
      return contributionMap;
    }

    // GraphQL query to fetch contributions from the past year
    const query = `
      query {
        user(login: "${username}") {
          contributionsCollection {
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
      console.error('GraphQL error:', response.data.errors);
      return contributionMap;
    }

    // Parse the contribution calendar
    const weeks = response.data.data?.user?.contributionsCollection?.contributionCalendar?.weeks || [];
    
    weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        if (day.contributionCount > 0) {
          contributionMap.set(day.date, day.contributionCount);
        }
      });
    });

    return contributionMap;
  } catch (error) {
    console.error('Error parsing GitHub contributions:', error);
    return new Map();
  }
};

/**
 * Generate a heatmap image URL using QuickChart
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data
 * @returns {string} QuickChart URL for the heatmap
 */
const generateHeatmapImageUrl = (username, contributionMap) => {
  try {
    const contributionArray = Array.from(contributionMap.values());
    const maxContributions = Math.max(...contributionArray, 1);

    // Create labels (dates) and data for the chart - show up to 52 weeks
    const sortedDates = Array.from(contributionMap.keys()).sort();
    const labels = sortedDates.slice(-52); // Last 52 weeks (~1 year)
    const data = labels.map((date) => contributionMap.get(date) || 0);

    // Create QuickChart config with a horizontal bar chart
    const chartConfig = {
      type: 'bar',
      data: {
        labels: labels.map((d) => d), // Show full date
        datasets: [
          {
            label: 'Contributions',
            data: data,
            backgroundColor: data.map((val) => {
              // GitHub-style contribution colors
              const intensity = val / maxContributions;
              if (intensity === 0) return '#ebedf0';
              if (intensity < 0.25) return '#c6e48b';
              if (intensity < 0.5) return '#7bc96f';
              if (intensity < 0.75) return '#239a3b';
              return '#196127';
            }),
            borderRadius: 2,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: {
            display: false,
          },
          title: {
            display: true,
            text: `${username}'s Contributions (Last Year)`,
            font: { size: 16 },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: maxContributions,
            title: {
              display: true,
              text: 'Commits',
            },
          },
        },
      },
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    const imageUrl = `https://quickchart.io/chart?c=${encodedConfig}`;

    return imageUrl;
  } catch (error) {
    console.error('Error generating heatmap image URL:', error);
    return null;
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
 * Fetch contribution graph data with both text and image
 * @param {string} username - GitHub username
 * @param {string} token - GitHub personal access token
 * @returns {Promise<Object>} Object with text graph and image buffer
 */
const fetchContributionGraph = async (username, token) => {
  try {
    const contributionMap = await parseGitHubContributions(username, token);

    const textGraph = generateTextGraph(username, contributionMap);
    const imageUrl = generateHeatmapImageUrl(username, contributionMap);
    const imageBuffer = await downloadHeatmapImage(imageUrl);

    return {
      textGraph,
      imageUrl,
      imageBuffer,
      contributionCount: contributionMap.size,
    };
  } catch (error) {
    console.error('Error fetching contribution graph:', error);
    return {
      textGraph: 'Error generating contribution graph',
      imageUrl: null,
      imageBuffer: null,
      contributionCount: 0,
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

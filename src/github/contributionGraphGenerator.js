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
    if (contributionMap.size === 0) {
      return null;
    }

    const sortedDates = Array.from(contributionMap.keys()).sort();
    const maxContributions = Math.max(...Array.from(contributionMap.values()), 1);
    
    // GitHub-style color palette
    const colors = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
    
    // Create grid: Map dates to grid coordinates
    const grid = {};
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    sortedDates.forEach((dateStr) => {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const dayOfWeek = date.getDay();
      
      // Calculate ISO week number
      const d = new Date(Date.UTC(year, date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      
      grid[`${weekNum}-${dayOfWeek}`] = {
        date: dateStr,
        count: contributionMap.get(dateStr),
      };
    });
    
    // SVG dimensions
    const cellSize = 12;
    const cellPadding = 2;
    const marginLeft = 40;
    const marginTop = 30;
    const marginBottom = 20;
    const weeksToShow = 52;
    
    const width = marginLeft + weeksToShow * (cellSize + cellPadding) + 40;
    const height = marginTop + 7 * (cellSize + cellPadding) + marginBottom;
    
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .cell { stroke: #e0e0e0; stroke-width: 1; }
        .day-label { font-size: 11px; text-anchor: end; fill: #666; font-family: Arial; }
        .month-label { font-size: 10px; text-anchor: middle; fill: #999; font-family: Arial; }
        .title { font-size: 14px; font-weight: bold; fill: #333; font-family: Arial; }
        .tooltip { font-size: 10px; }
      </style>
      
      <text x="${width / 2}" y="20" text-anchor="middle" class="title">${username}'s Contributions (Last Year)</text>`;
    
    // Draw day labels (Sun-Sat)
    dayLabels.forEach((day, idx) => {
      svg += `<text x="30" y="${marginTop + idx * (cellSize + cellPadding) + cellSize}" class="day-label">${day}</text>`;
    });
    
    // Draw grid cells
    for (let week = 0; week < weeksToShow; week++) {
      for (let day = 0; day < 7; day++) {
        const key = `${week}-${day}`;
        const cellData = grid[key];
        const count = cellData ? cellData.count : 0;
        
        // Calculate color intensity
        let colorIdx = 0;
        if (count > 0) {
          const intensity = count / maxContributions;
          if (intensity > 0.75) colorIdx = 4;
          else if (intensity > 0.5) colorIdx = 3;
          else if (intensity > 0.25) colorIdx = 2;
          else colorIdx = 1;
        }
        
        const x = marginLeft + week * (cellSize + cellPadding);
        const y = marginTop + day * (cellSize + cellPadding);
        const title = cellData ? `${cellData.date}: ${count} contribution${count !== 1 ? 's' : ''}` : 'No data';
        
        svg += `<rect class="cell" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${colors[colorIdx]}" rx="1">
          <title>${title}</title>
        </rect>`;
      }
    }
    
    svg += `</svg>`;
    
    // Convert SVG to data URL
    const encodedSvg = encodeURIComponent(svg);
    const imageUrl = `data:image/svg+xml,${encodedSvg}`;
    
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

/**
 * Local chart renderer - generates contribution charts as base64 PNG/SVG
 * No external APIs needed, works completely offline on Discloud
 */

/**
 * Generate a contribution heatmap as SVG
 * 7 rows (days) x 52 columns (weeks) grid like GitHub's official
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data { date: count }
 * @returns {string} SVG string
 */
const generateContributionHeatmapSVG = (username, contributionMap) => {
  if (contributionMap.size === 0) {
    return null;
  }

  const cellSize = 24;
  const padding = 30;
  const sidePadding = 40;
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Get sorted dates
  const sortedDates = Array.from(contributionMap.keys()).sort();
  
  // Use today's date as the newest date (dynamically scrolls as weeks pass)
  const newestDate = new Date();
  
  // Calculate cutoff date: 6 months back from today
  const cutoffDate = new Date(newestDate);
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  
  // Filter contribution data to last 6 months only
  const filteredDates = sortedDates.filter(dateStr => dateStr >= cutoffDateStr);
  
  if (filteredDates.length === 0) {
    return null;
  }
  
  // Use cutoff date (6 months ago) as the reference point
  const oldestInRange = new Date(cutoffDate);
  oldestInRange.setDate(oldestInRange.getDate() - oldestInRange.getDay()); // Move to Sunday
  
  console.log(`📅 Grid reference point (oldest Sunday in 6mo range): ${oldestInRange.toISOString().split('T')[0]}`);
  
  // Calculate what date range that represents
  const newestGrid = new Date(oldestInRange);
  newestGrid.setDate(newestGrid.getDate() + (26 * 7)); // 26 weeks forward
  console.log(`📅 Grid date range: ${oldestInRange.toISOString().split('T')[0]} to ${newestGrid.toISOString().split('T')[0]}`);
  
  // Calculate max contributions for color intensity
  const maxContributions = Math.max(...filteredDates.map(d => contributionMap.get(d)), 1);
  
  // Contribution color scale (reversed - lighter means more)
  const getColor = (count) => {
    if (count === 0) return '#3f4451';
    const intensity = count / maxContributions;
    if (intensity > 0.66) return '#D5E339'; // Light yellowish-green (high)
    if (intensity > 0.33) return '#90964E'; // Medium olive (medium)
    return '#666E00'; // Dark olive (low)
  };

  // Get text color based on cell background (dark text on light cells)
  const getTextColor = (count) => {
    if (count === 0) return '#D5E339';
    const intensity = count / maxContributions;
    if (intensity > 0.66) return '#1a1a1a'; // Dark text on light background
    return '#D5E339'; // Light text on dark background
  };

  // Calculate weeks needed to cover 6 months (26-27 weeks)
  const weeksNeeded = 27;
  const grid = Array(7).fill(null).map(() => Array(weeksNeeded).fill(0));
  
  // Helper: get week index relative to cutoff date
  const getWeekIndex = (dateStr) => {
    const date = new Date(dateStr);
    // Get Sunday of the same week
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    
    // Get Sunday of the cutoff date's week
    const oldD = new Date(oldestInRange);
    
    // Calculate weeks between
    const diffTime = d - oldD;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.floor(diffDays / 7);
  };
  
  // Populate grid from contribution data
  filteredDates.forEach(dateStr => {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const weekIndex = getWeekIndex(dateStr);
    
    if (weekIndex >= 0 && weekIndex < weeksNeeded) {
      grid[dayOfWeek][weekIndex] = contributionMap.get(dateStr);
      const count = contributionMap.get(dateStr);
      if (count > 0) {
        console.log(`  📌 Placed ${dateStr} at week ${weekIndex}, row ${dayOfWeek}: ${count}`);
      }
    } else {
      console.warn(`  ⚠️ ${dateStr} out of bounds - weekIndex: ${weekIndex}`);
    }
  });
  

// and darker means less contributions
  // Always render all 6 months (26-27 weeks) regardless of data
  const minWeekWithData = 0;
  const maxWeekWithData = weeksNeeded - 1;
  
  const weeksToRender = maxWeekWithData - minWeekWithData + 1;
  const width = sidePadding + (weeksToRender * cellSize) + sidePadding + 20;
  const height = padding + 100 + (7 * cellSize) + 20;  // Reduced bottom padding since legend removed
  
  // Start building SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .label { font-family: Arial, sans-serif; font-size: 11px; fill: #666; }
    .title { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; fill: #D5E339; }
    .cell { fill-opacity: 0.95; }
    .contribution-text { font-family: Arial, sans-serif; font-size: 8px; fill: #D5E339; font-weight: bold; }
  </style>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="transparent"/>
  
  <!-- Title -->
  <text x="${width/2}" y="20" class="title" text-anchor="middle">${username}'s Contributions (Last 6 Months)</text>
  
  <!-- Day labels -->`;
  
  dayLabels.forEach((label, i) => {
    svg += `\n  <text x="${sidePadding - 15}" y="${padding + 85 + (i * cellSize) + 10}" class="label" text-anchor="end" font-size="12">${label}</text>`;
  });
  
  // Calculate and render month labels - find start and end week for each month
  const monthLabelsMap = {};
  const monthEndWeekMap = {};
  for (let week = minWeekWithData; week <= maxWeekWithData; week++) {
    // Get approximate date for this week (use middle day, Thursday)
    const testDate = new Date(oldestInRange);
    testDate.setDate(testDate.getDate() + (week * 7) + 4); // +4 to get Thursday
    const monthYear = testDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    
    if (!monthLabelsMap[monthYear]) {
      monthLabelsMap[monthYear] = week;  // First week of month
    }
    monthEndWeekMap[monthYear] = week;  // Last week of month
  }
  
  // Render month labels centered on each month's span
  Object.entries(monthLabelsMap).forEach(([monthYear, startWeek]) => {
    const endWeek = monthEndWeekMap[monthYear];
    const midWeek = (startWeek + endWeek) / 2;  // Center of month
    const xOffset = (midWeek - minWeekWithData) * cellSize;
    const x = sidePadding + xOffset + (cellSize / 2);
    svg += `\n  <text x="${x}" y="${padding + 45}" class="label" font-size="11" text-anchor="middle">${monthYear}</text>`;
  });
  
  // Draw contribution grid
  console.log(`\n🎨 SVG Grid rendering (weeks 0-${weeksNeeded-1}, days 0-6):`);
  let visibleCells = 0;
  for (let week = 0; week < weeksNeeded; week++) {
    for (let day = 0; day < 7; day++) {
      if (grid[day][week] > 0) visibleCells++;
    }
  }
  console.log(`  Total cells with data: ${visibleCells}`);
  
  svg += '\n  <!-- Contribution grid -->';
  for (let week = minWeekWithData; week <= maxWeekWithData; week++) {
    for (let day = 0; day < 7; day++) {
      const xOffset = (week - minWeekWithData) * cellSize;
      const x = sidePadding + xOffset;
      const y = padding + 75 + (day * cellSize);
      const count = grid[day][week];
      const color = getColor(count);
      
      svg += `\n  <rect x="${x}" y="${y}" width="${cellSize - 2}" height="${cellSize - 2}" rx="3" ry="3" fill="${color}" class="cell"/>`;
      
      if (count > 0) {
        const textColor = getTextColor(count);
        svg += `\n  <text x="${x + (cellSize - 2) / 2}" y="${y + (cellSize - 2) / 2 + 3}" fill="${textColor}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" text-anchor="middle">${count}</text>`;
      }
    }
  }
  
  // Legend
  svg += `\n</svg>`;
  
  return svg;
};

/**
 * Convert SVG to base64 data URI for embedding in Discord
 * @param {string} svgString - SVG content
 * @returns {string} Base64 data URI
 */
const svgToDataUri = (svgString) => {
  if (!svgString) return null;
  const encoded = Buffer.from(svgString).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
};

/**
 * Generate weekly contribution bar chart as SVG
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data
 * @returns {string} SVG string
 */
const generateWeeklyBarChartSVG = (username, contributionMap) => {
  if (contributionMap.size === 0) {
    return null;
  }

  // Aggregate to weekly data
  const sortedDates = Array.from(contributionMap.keys()).sort();
  const weeklyData = {};
  
  sortedDates.forEach(dateStr => {
    const date = new Date(dateStr);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weekKey = `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    
    weeklyData[weekKey] = (weeklyData[weekKey] || 0) + contributionMap.get(dateStr);
  });
  
  const weeks = Object.keys(weeklyData).sort();
  const data = weeks.map(week => weeklyData[week]);
  const maxValue = Math.max(...data);
  
  // Format date range for display
  const firstDate = new Date(sortedDates[0]);
  const lastDate = new Date(sortedDates[sortedDates.length - 1]);
  const dateRangeText = `${firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  
  const width = 1000;
  const height = 430;  // Increased for subtitle
  const padding = 60;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2) - 40;  // Space for subtitle
  const barWidth = Math.min(20, (chartWidth / weeks.length) * 0.8);
  const barGap = chartWidth / weeks.length;
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .label { font-family: Arial, sans-serif; font-size: 12px; fill: #666; }
    .title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; fill: #333; }
    .subtitle { font-family: Arial, sans-serif; font-size: 13px; fill: #888; font-style: italic; }
    .bar { fill: #1f6feb; stroke: #0969da; stroke-width: 1; }
    .axis { stroke: #ccc; stroke-width: 1; }
    .grid-line { stroke: #e0e0e0; stroke-width: 1; }
  </style>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="white"/>
  
  <!-- Title -->
  <text x="${width/2}" y="30" class="title" text-anchor="middle">${username}'s Weekly Contributions</text>
  
  <!-- Subtitle with date range -->
  <text x="${width/2}" y="50" class="subtitle" text-anchor="middle">Last 6 months: ${dateRangeText}</text>
  
  <!-- Grid lines and Y-axis labels -->`;
  
  for (let i = 0; i <= 5; i++) {
    const y = height - padding - (i * chartHeight / 5);
    const value = Math.round((i / 5) * maxValue);
    svg += `\n  <line x1="${padding}" x2="${width - padding}" y1="${y}" y2="${y}" class="grid-line"/>`;
    svg += `\n  <text x="${padding - 10}" y="${y + 4}" class="label" text-anchor="end">${value}</text>`;
  }
  
  // Axes
  svg += `\n  <!-- Axes -->
  <line x1="${padding}" y1="70" x2="${padding}" y2="${height - padding}" class="axis"/>
  <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis"/>`;
  
  // Bars
  svg += '\n  <!-- Bars -->';
  data.forEach((value, index) => {
    const x = padding + (index * barGap) + (barGap - barWidth) / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = height - padding - barHeight;
    
    svg += `\n  <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" class="bar" data-week="${weeks[index]}" data-value="${value}"/>`;
  });
  
  // X-axis labels (every 2-4 weeks depending on total weeks)
  svg += '\n  <!-- Week labels -->';
  const labelInterval = weeks.length > 40 ? 4 : weeks.length > 20 ? 2 : 1;
  weeks.forEach((week, index) => {
    if (index % labelInterval === 0) {
      const x = padding + (index * barGap) + barGap / 2;
      svg += `\n  <text x="${x}" y="${height - padding + 20}" class="label" text-anchor="middle" font-size="10">${week}</text>`;
    }
  });
  
  svg += `\n</svg>`;
  
  return svg;
};

/**
 * Convert SVG string to PNG buffer using Sharp
 * @param {string} svgString - SVG XML string
 * @param {Object} options - Conversion options { width, height, density }
 * @returns {Promise<Buffer>} PNG image buffer
 */
const svgToPngBuffer = async (svgString, options = {}) => {
  try {
    const sharp = require('sharp');
    
    if (!svgString) {
      console.error('❌ No SVG string provided for PNG conversion');
      return null;
    }

    const { width = 1000, height = 400, density = 300 } = options;

    console.log(`🎨 Converting SVG to PNG (${width}x${height}, ${density}dpi)...`);

    // Convert SVG to PNG using Sharp with high density for sharpness
    const pngBuffer = await sharp(Buffer.from(svgString), { 
      density: density  // Very high density for crisp vector rendering
    })
      .png({ quality: 100, compressionLevel: 6, progressive: false })
      .resize(width, height, { 
        fit: 'inside',  // Fit inside bounds without distortion
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 } 
      })
      .toBuffer();

    console.log(`✅ PNG generated successfully (${pngBuffer.length} bytes)`);
    
    return pngBuffer;
  } catch (error) {
    console.error(`❌ Error converting SVG to PNG: ${error.message}`);
    return null;
  }
};

/**
 * Generate heatmap SVG and convert to PNG buffer
 * @param {string} username - GitHub username
 * @param {Map} contributionMap - Contribution data
 * @returns {Promise<{png: Buffer, svg: string}>} PNG buffer and SVG string
 */
const generateContributionHeatmapPNG = async (username, contributionMap) => {
  try {
    // Generate SVG first
    const svgString = generateContributionHeatmapSVG(username, contributionMap);
    
    if (!svgString) {
      console.warn(`⚠️ Failed to generate heatmap SVG for ${username}`);
      return { png: null, svg: null };
    }

    // Convert to PNG with max dimensions 1200x500 (2x size) - high quality
    const pngBuffer = await svgToPngBuffer(svgString, { 
      width: 1200, 
      height: 500,
      density: 400  // Very high DPI for sharp rendering
    });

    return { png: pngBuffer, svg: svgString };
  } catch (error) {
    console.error(`❌ Error generating heatmap PNG: ${error.message}`);
    return { png: null, svg: null };
  }
};

/**
 * Generate a text-based contribution display for the current week
 * Shows each day with a bar chart made of block characters
 * @param {Map} contributionMap - Contribution data { date: count }
 * @returns {string} Formatted text with weekly contributions
 */
const generateWeeklyTextContribution = (contributionMap) => {
  if (contributionMap.size === 0) {
    return null;
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const blockChars = {
    full: '█',      // Highest (66-100%)
    high: '▇',      // High (50-66%)
    medium: '▆',    // Medium (33-50%)
    low: '▃',       // Low (1-33%)
    empty: ' '      // None (0%)
  };

  // Get today's date and calculate the start of this week (Sunday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);

  // Collect this week's contributions (Sun to today)
  const weekDays = [];
  let maxContributions = 0;
  
  for (let i = 0; i <= dayOfWeek; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const count = contributionMap.get(dateStr) || 0;
    
    weekDays.push({
      day: dayLabels[i],
      date: dateStr,
      count: count
    });
    
    maxContributions = Math.max(maxContributions, count);
  }

  // If no contributions this week, return early
  if (maxContributions === 0) {
    return `No contributions`;
  }

  // Generate text representation for each day
  let textOutput = '';
  
  weekDays.forEach(dayData => {
    const count = dayData.count;
    let barChar = blockChars.empty;
    
    if (count > 0) {
      const intensity = count / maxContributions;
      if (intensity > 0.66) {
        barChar = blockChars.full;
      } else if (intensity > 0.50) {
        barChar = blockChars.high;
      } else if (intensity > 0.33) {
        barChar = blockChars.medium;
      } else {
        barChar = blockChars.low;
      }
    }

    // Generate bar (repeat character based on count)
    const barLength = count > 0 ? Math.max(1, Math.ceil((count / maxContributions) * 24)) : 0;
    const bar = barChar.repeat(barLength);
    
    // Format: "Sun: ▃▃▃▃▃ 5 commits"
    const commitText = count === 1 ? 'commit' : 'commits';
    textOutput += `${dayData.day}: ${bar} ${count} ${commitText}\n`;
  });

  return textOutput.trim();
};

module.exports = {
  generateContributionHeatmapSVG,
  generateContributionHeatmapPNG,
  generateWeeklyBarChartSVG,
  generateWeeklyTextContribution,
  svgToDataUri,
  svgToPngBuffer,
};

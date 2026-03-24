const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { addUser, removeUser, listUserInfo, getUser } = require('../storage/userStorage');
const { fetchRecentCommits, fetchContributionGraph } = require('../github/contributionGraphGenerator');
const { generateWeeklyTextContribution } = require('../github/chartRenderer');

/**
 * Generate a random webhook secret
 * @returns {string} Random 32-character hex string
 */
const generateWebhookSecret = () => {
  return require('crypto').randomBytes(16).toString('hex');
};

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('track')
      .setDescription('Add a GitHub user to track contributions')
      .addStringOption((option) =>
        option
          .setName('username')
          .setDescription('GitHub username to track')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('token')
          .setDescription('GitHub personal access token')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('webhook_secret')
          .setDescription('Webhook secret (leave empty to generate one)')
          .setRequired(false)
      ),

    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const username = interaction.options.getString('username');
      const token = interaction.options.getString('token');
      const webhookSecretInput = interaction.options.getString('webhook_secret');
      const webhookSecret = webhookSecretInput || generateWebhookSecret();

      try {
        // Validate GitHub token by making a test API call
        const axios = require('axios');
        await axios.get('https://api.github.com/user', {
          headers: { Authorization: `token ${token}` },
        });

        // Save the user
        const userData = await addUser(interaction.user.id, username, token, webhookSecret);

        const embed = new EmbedBuilder()
          .setTitle('✅ GitHub User Tracked')
          .setColor(0xD5E339)
          .setDescription(`Successfully started tracking **${username}**`)
          .addFields(
            { name: 'GitHub Username', value: `\`${username}\``, inline: true },
            { name: 'Webhook Secret', value: `\`${webhookSecret}\``, inline: true },
            {
              name: '📝 Webhook Setup',
              value:
                'Go to your GitHub repository settings → Webhooks and add:\n' +
                `**Payload URL:** \`http://your-domain.com:3000/webhook/github/${interaction.user.id}\`\n` +
                `**Secret:** \`${webhookSecret}\`\n` +
                '**Content Type:** application/json\n' +
                '**Events:** Push events, Pull request events, Issues events',
            },
            { name: 'Tracked At', value: new Date(userData.addedAt).toLocaleString(), inline: false }
          );

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error in /track command:', error);

        const embed = new EmbedBuilder()
          .setTitle('❌ Error Tracking User')
          .setColor(0xD5E339)
          .setDescription('Failed to track GitHub user')
          .addFields({
            name: 'Reason',
            value: error.response?.status === 401 ? 'Invalid GitHub token' : error.message,
          });

        await interaction.editReply({ embeds: [embed] });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('tracked')
      .setDescription('View your tracked GitHub user info'),

    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const info = listUserInfo(interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('📊 Tracked User Info')
        .setColor(0xD5E339)
        .setDescription(info);

      await interaction.editReply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('untrack')
      .setDescription('Stop tracking your GitHub user'),

    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const removed = await removeUser(interaction.user.id);

      if (removed) {
        const embed = new EmbedBuilder()
          .setTitle('✅ Untracked')
          .setColor(0xD5E339)
          .setDescription('Stopped tracking your GitHub user');

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('❌ No User Tracked')
          .setColor(0xD5E339)
          .setDescription('You do not have a tracked GitHub user');

        await interaction.editReply({ embeds: [embed] });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('recent')
      .setDescription('Show your recent commits from the last 24 hours'),

    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const user = getUser(interaction.user.id);

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('❌ No User Tracked')
          .setColor(0xD5E339)
          .setDescription('Run `/track` first to track your GitHub user');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      try {
        const recentCommits = await fetchRecentCommits(user.githubUsername, user.githubToken, 1); // Last 1 day

        if (recentCommits.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('📊 No Recent Commits')
            .setColor(0xD5E339)
            .setDescription(`No commits found for **${user.githubUsername}** in the last 24 hours`);

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const commitMessages = recentCommits
          .slice(0, 10) // Show top 10 commits
          .map((commit) => `• [\`${commit.shortHash}\`](https://github.com/${user.githubUsername}/${commit.repo}/commit/${commit.shortHash}) ${commit.message} - **${commit.repo}**`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`📝 Recent Commits - Last 24 Hours`)
          .setColor(0xD5E339)
          .setDescription(commitMessages)
          .setAuthor({ name: user.githubUsername })
          .setURL(`https://github.com/${user.githubUsername}`)
          .setTimestamp()
          .setFooter({ text: `Total: ${recentCommits.length} commits found` });

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error fetching recent commits:', error);

        const embed = new EmbedBuilder()
          .setTitle('❌ Error Fetching Commits')
          .setColor(0xD5E339)
          .setDescription('Failed to fetch recent commits. Check your GitHub token.');

        await interaction.editReply({ embeds: [embed] });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('graph')
      .setDescription('View your yearly contribution heatmap'),

    async execute(interaction) {
      await interaction.deferReply({ flags: [] });

      const user = getUser(interaction.user.id);

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('❌ No User Tracked')
          .setColor(0xD5E339)
          .setDescription('Run `/track` first to track your GitHub user');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      try {
        const graphData = await fetchContributionGraph(user.githubUsername, user.githubToken);

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${user.githubUsername}'s Contribution Heatmap`)
          .setDescription(graphData.dateRange || 'Loading contribution data...')
          .setColor(0xD5E339)
          .setAuthor({ name: user.githubUsername })
          .setURL(`https://github.com/${user.githubUsername}`)
          .setTimestamp()
          .setFooter({ text: `Total contributions tracked: ${graphData.contributionCount || 0}` });

        // Add weekly text contribution if available
        if (graphData.contributionMap && graphData.contributionMap.size > 0) {
          const weeklyText = generateWeeklyTextContribution(graphData.contributionMap);
          if (weeklyText) {
            embed.addFields({ name: '📈 This Week', value: weeklyText, inline: false });
          }
        }

        // Display generated contribution chart as PNG
        if (graphData.pngBuffer) {
          // Create file attachment from PNG buffer
          const attachment = new AttachmentBuilder(graphData.pngBuffer, { name: `${user.githubUsername}-contributions.png` });
          
          embed.setImage(`attachment://${user.githubUsername}-contributions.png`);
          embed.setDescription(graphData.dateRange || 'No recent contributions');
          
          await interaction.editReply({ embeds: [embed], files: [attachment] });
        } else {
          embed.setDescription(graphData.dateRange || 'No contribution data available');
          await interaction.editReply({ embeds: [embed] });
        }
      } catch (error) {
        console.error('Error fetching contribution graph:', error);

        const embed = new EmbedBuilder()
          .setTitle('❌ Error Fetching Heatmap')
          .setColor(0xD5E339)
          .setDescription('Failed to fetch contribution heatmap. Check your GitHub token.');

        await interaction.editReply({ embeds: [embed] });
      }
    },
  },
];

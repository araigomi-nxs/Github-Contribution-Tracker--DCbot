const { Client, GatewayIntentBits, ChannelType, EmbedBuilder, REST, Routes } = require('discord.js');
const commands = require('./commands');

let client;

const initializeDiscordBot = async () => {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ],
  });

  // Handle slash command interactions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = commands.find((cmd) => cmd.data.name === interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error('Error executing command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error executing this command!',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'There was an error executing this command!',
          ephemeral: true,
        });
      }
    }
  });

  client.once('clientReady', async () => {
    console.log(`✓ Discord bot logged in as ${client.user.tag}`);

    // Register slash commands
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

      const commandData = commands.map((cmd) => cmd.data.toJSON());

      // Use guild-specific registration for instant testing, or global for production
      if (process.env.DISCORD_GUILD_ID && process.env.DISCORD_GUILD_ID !== 'your_guild_id_here') {
        await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.DISCORD_GUILD_ID), {
          body: commandData,
        });
        console.log(`✓ Registered ${commandData.length} slash commands to guild ${process.env.DISCORD_GUILD_ID}`);
      } else {
        await rest.put(Routes.applicationCommands(client.user.id), {
          body: commandData,
        });
        console.log(`✓ Registered ${commandData.length} slash commands globally (may take ~1 hour)`);
      }
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  });

  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('Failed to login to Discord:', error);
    process.exit(1);
  }
};

const getClient = () => {
  if (!client) {
    throw new Error('Discord client not initialized');
  }
  return client;
};

const sendWebhookMessage = async (userId, title, description, author, commitUrl, graphText, imageUrl) => {
  try {
    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setAuthor({ name: author })
      .setColor(0x1f6feb)
      .setURL(commitUrl)
      .setTimestamp();

    // Add contribution graph as a field if available
    if (graphText) {
      embed.addFields({ name: '📊 Contributions', value: graphText });
    }

    // Add heatmap image if available (HTTP URL)
    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    // Try to send to the configured channel first
    if (process.env.DISCORD_CHANNEL_ID) {
      try {
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

        if (channel && channel.type === ChannelType.GuildText) {
          await channel.send({ embeds: [embed] });
          console.log(`✓ Message sent to Discord channel`);
          return;
        }
      } catch (error) {
        console.error('Error sending to channel:', error);
      }
    }

    // Fallback: Send as DM to the user
    try {
      const user = await client.users.fetch(userId);
      if (user) {
        await user.send({ embeds: [embed] });
        console.log(`✓ Message sent to user DM`);
      }
    } catch (error) {
      console.error('Error sending DM:', error);
    }
  } catch (error) {
    console.error('Error sending Discord message:', error);
  }
};

module.exports = {
  initializeDiscordBot,
  getClient,
  sendWebhookMessage,
};

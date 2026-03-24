const { Client, GatewayIntentBits, ChannelType, EmbedBuilder, REST, Routes, MessageFlags, Events } = require('discord.js');
const commands = require('./commands');

let client;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // 5 seconds
let isReady = false;

const initializeDiscordBot = async () => {
  try {
    console.log('📍 Starting initializeDiscordBot...');
    
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
      ],
    });

    console.log('✓ Discord.js Client object created');

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
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: 'There was an error executing this command!',
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    });

    console.log('✓ interactionCreate handler attached');

    let clientReadyFired = false;

    client.once(Events.ClientReady, async () => {
      try {
        clientReadyFired = true;
        console.log(`✓ ClientReady event fired! Bot user: ${client.user.tag}`);
        
        // Register slash commands
        try {
          const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
          const commandData = commands.map((cmd) => cmd.data.toJSON());

          if (process.env.DISCORD_GUILD_ID && process.env.DISCORD_GUILD_ID !== 'your_guild_id_here') {
            await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.DISCORD_GUILD_ID), {
              body: commandData,
            });
            console.log(`✓ Registered ${commandData.length} slash commands to guild ${process.env.DISCORD_GUILD_ID}`);
          } else {
            await rest.put(Routes.applicationCommands(client.user.id), {
              body: commandData,
            });
            console.log(`✓ Registered ${commandData.length} slash commands globally`);
          }
        } catch (error) {
          console.warn('⚠️  Error registering slash commands:', error.message);
        }

        isReady = true;
        console.log('✅ Discord bot is fully ready');
      } catch (error) {
        console.error('❌ Error in ClientReady event:', error.message);
        console.error('   Stack:', error.stack);
        isReady = true; // Mark ready anyway
      }
    });

    // Connection events
    client.on('disconnect', () => {
      console.warn('⚠️  Discord bot disconnected');
      isReady = false;
      clientReadyFired = false;
    });

    client.on('reconnecting', () => {
      console.log('🔄 Discord bot reconnecting...');
    });

    client.on('error', (error) => {
      console.error('❌ Discord client error:', error.message);
      console.error('   Code:', error.code);
      if (error.stack) console.error('   Stack:', error.stack);
    });

    client.on('warn', (warning) => {
      console.warn('⚠️  Discord warning:', warning);
    });

    console.log('✓ All event listeners attached');

    console.log('🔐 Attempting Discord bot login with token:', process.env.DISCORD_TOKEN ? '***PRESENT***' : '***MISSING***');
    
    // Fire off login without awaiting - let it happen in background
    // The event listeners (ClientReady, error, warn) will handle the connection
    try {
      console.log('📞 Initiating async login (non-blocking)...');
      
      client.login(process.env.DISCORD_TOKEN)
        .then(() => {
          console.log('✅ Client login promise resolved');
        })
        .catch((error) => {
          console.error('❌ Client login rejected:', error.message);
          if (error.code) console.error('   Code:', error.code);
        });
      
      console.log('✓ Login fired off - ClientReady event will fire when ready');
    } catch (error) {
      console.error('❌ Exception in client.login():', error.message);
      throw error;
    }

  } catch (error) {
    console.error('❌ Critical error in Discord initialization:', error.message);
    console.error('   Stack:', error.stack);
    throw error;
  }
};

const waitForReady = async () => {
  if (isReady) {
    console.log('✓ Discord client already ready');
    return;
  }
  
  console.log('⏳ Waiting for Discord client to be ready...');
  console.log(`   Client exists: ${!!client}, Client.user exists: ${client ? !!client.user : false}`);
  
  // Use a much simpler approach - just wait a bit and check if client exists
  let attempts = 0;
  while (!isReady && attempts < 60) {
    if (client && client.user) {
      console.log(`✅ Discord client became ready (user: ${client.user.tag})`);
      isReady = true;
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
    attempts++;
    
    if (attempts % 10 === 0) {
      console.log(`   Still waiting... (${attempts}s elapsed). Client: ${!!client}, User: ${client ? !!client.user : 'N/A'}`);
    }
  }
  
  if (attempts >= 60) {
    console.warn('⚠️  TIMEOUT: Discord not ready after 60 seconds');
    if (client) {
      console.warn(`   Client exists but not ready. User: ${client.user ? client.user.tag : 'NO USER'}`);
    } else {
      console.warn('   Client object is null or undefined!');
    }
    console.warn('   Proceeding anyway, but webhooks may fail...');
  }
  
  isReady = true; // Force ready after timeout
};

const getClient = () => {
  if (!client) {
    throw new Error('Discord client not initialized');
  }
  return client;
};

const sendWebhookMessage = async (userId, title, description, author, commitUrl, graphText, imageUrlOrBuffer, userName) => {
  try {
    const { AttachmentBuilder } = require('discord.js');
    
    // Wait for Discord client to be fully ready
    await waitForReady();
    
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

    let files = [];

    // Handle PNG buffer (preferred) or HTTP URL
    if (imageUrlOrBuffer && Buffer.isBuffer(imageUrlOrBuffer)) {
      // It's a PNG buffer - create file attachment
      const attachmentName = `${userName || author}-contributions.png`;
      const attachment = new AttachmentBuilder(imageUrlOrBuffer, { name: attachmentName });
      embed.setImage(`attachment://${attachmentName}`);
      files.push(attachment);
    } else if (imageUrlOrBuffer) {
      // It's an HTTP URL - use directly
      embed.setImage(imageUrlOrBuffer);
    }

    let messageSent = false;

    // Try to send to the configured channel first
    if (process.env.DISCORD_CHANNEL_ID && !messageSent) {
      try {
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

        if (channel && channel.type === ChannelType.GuildText) {
          const messageOptions = { embeds: [embed] };
          if (files.length > 0) {
            messageOptions.files = files;
          }
          await channel.send(messageOptions);
          console.log(`✓ Message sent to Discord channel #${channel.name}`);
          messageSent = true;
        }
      } catch (error) {
        console.warn(`⚠️  Could not send to channel: ${error.message}`);
      }
    }

    // Fallback: Send as DM to the user
    if (!messageSent) {
      try {
        const user = await client.users.fetch(userId);
        if (user) {
          const messageOptions = { embeds: [embed] };
          if (files.length > 0) {
            messageOptions.files = files;
          }
          await user.send(messageOptions);
          console.log(`✓ Message sent to user DM @${user.username}`);
          messageSent = true;
        }
      } catch (error) {
        console.error(`❌ Error sending DM to user ${userId}: ${error.message}`);
      }
    }

    if (!messageSent) {
      console.error(`❌ Failed to send message - no valid channel or DM target`);
      throw new Error('No valid message destination');
    }
  } catch (error) {
    console.error(`❌ Error sending Discord message: ${error.message}`);
    throw error;
  }
};

module.exports = {
  initializeDiscordBot,
  getClient,
  sendWebhookMessage,
  waitForReady,
};

# GitHub Contribution Tracker - Discord Bot

A Discord bot that tracks GitHub contributions in real-time and sends embed messages with contribution graphs when you commit, create pull requests, or open issues.

## Features

- 🎯 Track multiple GitHub users per Discord user
- 📊 Real-time GitHub webhook tracking
- 📈 Text-based contribution graph visualization
- 📤 Discord embed messages with activity context
- ✅ Per-user HMAC signature verification
- 🚀 Pure JavaScript with Express.js and Discord.js
- 💾 Persistent user storage with JSON
- 🤖 Slash commands for easy management

## Prerequisites

- Node.js 18+ and npm
- A Discord bot token
- A Discord server
- GitHub personal access token(s) for each user to track

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in required values:

```bash
cp .env.example .env
```

**Required variables:**

- `DISCORD_TOKEN`: Your Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)
- `DISCORD_CHANNEL_ID`: (Optional) Channel ID where updates will be sent. If not set, updates are sent as DMs.
- `PORT`: Server port (default 3000)

**Note:** GitHub tokens and webhook secrets are managed per-user via `/track` command.

### 3. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and enter a name
3. Go to "Bot" section and click "Add Bot"
4. Under TOKEN, click "Copy" to copy your bot token, paste it in `.env`
5. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
6. Go to OAuth2 > URL Generator with scopes: `bot` and permissions:
   - `Send Messages`
   - `Embed Links`
   - `Attach Files`
7. Join the bot to your server using the generated URL

### 4. Using the Bot

Once the bot is running, use the slash commands to manage tracked users:

#### `/track <username> <token> [webhook_secret]`

Add a GitHub user to track.

- `username`: Your GitHub username
- `token`: Your GitHub personal access token
- `webhook_secret`: (Optional) Custom webhook secret. If not provided, one will be generated.

**Response:** You'll receive the webhook details needed to set up GitHub webhooks.

#### `/tracked`

View your currently tracked GitHub user information.

#### `/untrack`

Stop tracking your GitHub user.

### 5. Set Up GitHub Webhooks

After using `/track`, the bot will provide webhook details. For each repository you want to track:

1. Go to repository Settings > Webhooks
2. Click "Add webhook"
3. **Payload URL**: Use the URL provided by the bot (format: `http://your-domain.com:3000/webhook/github/<discord-user-id>`)
4. **Content Type**: `application/json`
5. **Secret**: Use the webhook secret provided by the bot
6. **Events**: Select:
   - Push events
   - Pull request events
   - Issues events
7. Click "Add webhook"

### 6. Local Testing with ngrok

For local development and testing:

```bash
npm install -g ngrok
ngrok http 3000
```

Replace `http://your-domain.com:3000` with your ngrok URL in the webhook setup.

## Development

### Run Development Server

```bash
npm run dev
```

## Production

### Start

```bash
npm start
```

## Project Structure

```
src/
├── index.js                           # Express server & webhook endpoint
├── discord/
│   ├── bot.js                        # Discord bot client & messaging
│   └── commands.js                   # Slash commands (/track, /tracked, /untrack)
├── github/
│   ├── webhookHandler.js             # GitHub webhook event handlers
│   └── contributionGraphGenerator.js # Contribution graph visualization
└── storage/
    └── userStorage.js                # Persistent user data storage
```

## How It Works

1. **User Registration**: Use `/track` command to register your GitHub username, token, and optional webhook secret
2. **Storage**: User data is stored in `tracked-users.json` (created automatically)
3. **Webhook Setup**: The bot provides a unique webhook URL per user: `/webhook/github/<discord-user-id>`
4. **Event Processing**: GitHub sends events to the webhook with the per-user secret
5. **Notifications**: Bot processes events and sends contributions to Discord (channel or DM)
6. **Contribution Graph**: For each event, the bot fetches and displays a text-based contribution graph

## Webhook Events Handled

- **Push events**: Sends commit information with contribution graph
- **Pull request events**: Notifies on PR open, close, and updates
- **Issue events**: Notifies on issue creation and closing

## Security

- Each user has a unique webhook secret for HMAC-SHA256 verification
- Webhook payloads are verified using timing-safe comparison
- GitHub tokens are stored locally and never transmitted
- Environment variables are loaded from `.env` (not committed)
- Discord bot token is kept secure

## Data Storage

### File Structure

User tracking data is stored in `tracked-users.json`:

```json
{
  "discord-user-id": {
    "githubUsername": "username",
    "githubToken": "token",
    "webhookSecret": "secret",
    "addedAt": "ISO-timestamp"
  }
}
```

### Storage Features

**File Locking**

- Prevents concurrent writes and data corruption
- Automatically acquires/releases locks on save operations
- 5-second timeout for lock acquisition

**Automatic Backups**

- Creates timestamped backups before each write
- Keeps the last 10 backups automatically
- Located in `backups/` directory
- Auto-restore from latest backup if main file is corrupted

**Schema Validation**

- Validates all user data on load and save
- Ensures required fields are present and typed correctly
- Prevents invalid data from being stored

**Data Integrity**

- Atomic writes using temporary files
- Graceful fallback to backups on corruption
- Console logging for debugging

### Accessing Storage Statistics

The `getStats()` function provides:

```javascript
{
  totalUsers: number,      // Number of tracked users
  backups: number,         // Number of backup files
  lastModified: ISO-string // Last modification timestamp
}
```

## Troubleshooting

### Bot not responding

- Verify `DISCORD_TOKEN` is correct
- Make sure bot has permissions in the channel
- Check Message Content Intent is enabled

### Webhook not triggering

- Verify `GITHUB_WEBHOOK_SECRET` matches GitHub settings
- Check server logs for signature verification errors
- Use ngrok logs to verify requests are being received

### Contribution graph not showing

- Verify `GITHUB_TOKEN` is a valid personal access token
- Check `GITHUB_USERNAME` is correct

## License

MIT

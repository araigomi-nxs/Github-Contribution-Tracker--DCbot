<!-- GitHub Contribution Tracker - Discord Bot Configuration -->

# GitHub Contribution Tracker - Discord Bot

A Discord bot that tracks GitHub contributions in real-time via webhooks and sends embed messages with contribution graphs.

## Technology Stack

- **Language**: JavaScript (Node.js)
- **Bot Framework**: Discord.js v14
- **Server**: Express.js
- **GitHub Integration**: GitHub Webhooks + API
- **Graph Visualization**: Text-based contribution charts

## Getting Started

1. **Install dependencies**: `npm install`
2. **Configure environment**: Copy `.env.example` to `.env` and fill in required values
3. **Start server**: `npm start` or `npm run dev` for development

## Configuration

Required environment variables in `.env`:

- `DISCORD_TOKEN`: Discord bot token
- `DISCORD_CHANNEL_ID`: Channel ID for updates
- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_USERNAME`: Your GitHub username
- `GITHUB_WEBHOOK_SECRET`: Webhook signature secret
- `PORT`: Server port (default 3000)

See [README.md](../README.md) for detailed setup instructions for Discord bot and GitHub webhooks.

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

## Key Features

- ✅ Multi-user GitHub tracking support
- ✅ Real-time GitHub webhook handling with per-user HMAC verification
- ✅ Discord slash commands for user management
- ✅ Text-based contribution graph visualization
- ✅ **Persistent JSON storage with file locking**
- ✅ **Automatic backups and data recovery**
- ✅ **Schema validation and error handling**
- ✅ Discord embed messages with activity context
- ✅ Support for push, pull request, and issue events
- ✅ Pure JavaScript - no build step required
- ✅ Discloud hosting compatible

## Development Commands

- `npm run dev` - Start development server
- `npm start` - Run production server

## Notes for Future Development

- Image generation can be enhanced with more detailed graphs
- Add support for daily contribution summaries
- Consider adding reaction-based commands for bot interaction
- Add logging/monitoring for webhook events

# Discord XAuth Integration Bot

[![License: CSSM Unlimited License v2.0](https://img.shields.io/badge/License-CSSM%20Unlimited%20License%20v2.0-blue.svg?logo=opensourceinitiative)](LICENSE)

This project provides a Node.js bot to integrate Discord linked roles with an XAuthConnect authorization server. It allows users to link their Minecraft (XAuthConnect) account to their Discord profile, displaying their XAuth username as a linked role connection.

## Features

- **Discord Linked Roles Integration:** Connects user's XAuthConnect account to their Discord profile.
- **XAuth Username Display:** Shows the XAuth username in Discord's linked roles section.
- **Localization Support:** Discord command descriptions are localized, with support for multiple languages (e.g., English, Ukrainian). Easily extendable to other languages by adding new locale files.
- **Database Storage:** Stores linked user data (Discord ID, XAuth ID, tokens) in a PostgreSQL database.
- **Interactive CLI:** Manage the bot with commands directly from the console.
- **Automated Pruning:** Remove linked users who are no longer in the Discord server.
- **Metadata Refresh:** Update existing linked role metadata for all users.

## Installation

### Prerequisites

- Node.js (v18 or higher recommended)
- PostgreSQL database
- A Discord Application (for OAuth2, Bot, and Interactions)
- An XAuthConnect Authorization Server

### Steps

To begin, you will need to retrieve the project's source code, install all necessary dependencies, and then proceed to the configuration phase where all the Discord, XAuth, and database connection details are specified in the appropriate files:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/discord-xauth-integration.git
   cd discord-xauth-integration
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables (`.env` file):**
   Create a `.env` file in the project root based on `.env.example`.
   ```
   # Discord OAuth2 Redirect URI (must match your Discord Application settings)
   REDIRECT_URI=http://localhost:3000/discord/callback

   # Server Port
   PORT=3000

   # PostgreSQL Database Connection
   DB_HOST=localhost
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_DATABASE=your_db_name
   ```
   **Important:** The `REDIRECT_URI` must exactly match the one configured in your Discord Application's OAuth2 settings.

4. **Configure Communities (`config.json` file):**
   Create a `config.json` file in the project root based on `config.json.example`. This file defines your communities (e.g., Minecraft servers) and their respective Discord and XAuthConnect application credentials.
   ```json
   {
       "my_community": {
           "discord": {
               "clientId": "YOUR_DISCORD_CLIENT_ID",
               "clientSecret": "YOUR_DISCORD_CLIENT_SECRET",
               "guildId": "YOUR_DISCORD_GUILD_ID",
               "botToken": "YOUR_DISCORD_BOT_TOKEN",
               "publicKey": "YOUR_DISCORD_APPLICATION_PUBLIC_KEY"
           },
           "xauth": {
               "clientId": "YOUR_XAUTH_CLIENT_ID",
               "clientSecret": "YOUR_XAUTH_CLIENT_SECRET",
               "redirectUri": "http://localhost:3000/xauth/callback",
               "authorizationUrl": "http://xauth-server.com/oauth/authorize",
               "tokenUrl": "http://xauth-server.com/oauth/token",
               "userinfoUrl": "http://xauth-server.com/oauth/user",
               "scopes": ["profile:uuid", "profile:nickname"]
           }
       },
       "another_community": {
           "discord": {
               "clientId": "ANOTHER_DISCORD_CLIENT_ID",
               "clientSecret": "ANOTHER_DISCORD_CLIENT_SECRET",
               "guildId": "ANOTHER_DISCORD_GUILD_ID",
               "botToken": "ANOTHER_DISCORD_BOT_TOKEN",
               "publicKey": "ANOTHER_DISCORD_APPLICATION_PUBLIC_KEY"
           },
           "xauth": {
               "clientId": "ANOTHER_XAUTH_CLIENT_ID",
               "clientSecret": "ANOTHER_XAUTH_CLIENT_SECRET",
               "redirectUri": "http://localhost:3000/xauth/callback",
               "authorizationUrl": "http://xauth-server.com/oauth/authorize",
               "tokenUrl": "http://xauth-server.com/oauth/token",
               "userinfoUrl": "http://xauth-server.com/oauth/user",
               "scopes": ["profile:uuid", "profile:nickname"]
           }
       }
   }
   ```
   - **`my_community` (and `another_community`):** These are arbitrary names you choose to identify your different communities/servers.
   - **`discord.clientId`, `discord.clientSecret`:** Obtained from your Discord Application's OAuth2 settings.
   - **`discord.guildId`:** The ID of the Discord server (guild) associated with this community. See [How to get Guild ID](#how-to-get-guild-id).
   - **`discord.botToken`:** The token for your Discord bot. Ensure your bot has the `GUILD_MEMBERS_READ` privileged intent enabled in the Discord Developer Portal for the `prune` command to work.
   - **`discord.publicKey`:** The public key for your Discord Application, used for verifying interaction signatures. Obtain this from your Discord Application's General Information page.
   - **`xauth.*`:** Credentials and URLs for your XAuthConnect Authorization Server.

   **Note on Redirect URIs:**
   - The `REDIRECT_URI` in your `.env` file is the callback URL for your Discord Application's OAuth2 flow, pointing back to your bot.
   - The `xauth.redirectUri` within each community's configuration in `config.json` is the redirect URI that your XAuthConnect Authorization Server uses to send users back to your bot after successful authentication. Ensure both are correctly configured and match their respective application settings.

### Discord Bot Permissions and Intents

For the bot to function correctly, especially for features like `prune` and handling interactions, you need to configure specific permissions and enable certain [Privileged Gateway Intents](https://discord.com/developers/docs/topics/gateway#privileged-intents) in your Discord Developer Portal.

**Required Permissions (for your bot role in Discord):**
- `Send Messages` (for basic command responses)
- `Use Slash Commands` (for interacting with slash commands)

**Required Privileged Gateway Intents (in Discord Developer Portal -> Your Application -> Bot -> Privileged Gateway Intents):**
- `GUILD_MEMBERS_READ`: **Required for the `prune` command** to check if users are still in the guild. Without this, the `prune` command will not work correctly.

Ensure these are properly configured to avoid unexpected behavior.

### Discord Linked Roles and Multiple Communities

Discord's Linked Roles feature is tied to a specific **Discord Application**. This means that for a single Discord Application, only **one `platform_name` and one `platform_username`** can be displayed in a user's profile.

If you are managing multiple communities (e.g., different Minecraft servers like "NewLand" and "Hypixel") and a user might have a different XAuth username for each, consider the following:

- **To display distinct XAuth usernames for each community:** You **must** create a separate Discord Application for each distinct community. Each entry in your `config.json` for these communities should then use the `clientId` and `clientSecret` from its own dedicated Discord Application. This will result in multiple distinct "XAuthConnect" linked roles appearing on the user's Discord profile, each showing the correct username for that specific community (e.g., one labeled "XAuthConnect" with "PlayerNewLand" and another with "PlayerHypixel").

- **If using a single Discord Application for multiple communities:** The `platform_username` displayed in Discord's Linked Roles will be overwritten by the last XAuth account the user linked. For example, if a user links their "NewLand" account (username "PlayerNewLand") and then their "Hypixel" account (username "PlayerHypixel") using the *same* Discord Application, only "PlayerHypixel" will be displayed as the `platform_username`.

### How to get Guild ID

To get the ID of a Discord server (guild), you need to enable Developer Mode in your Discord client:

1. **Enable Developer Mode:**
   - Go to User Settings > Advanced.
   - Turn on "Developer Mode".

2. **Copy the Guild ID:**
   - Right-click on the server icon in the server list.
   - Click "Copy Server ID".

## Usage

After a successful installation and configuration, integrating the bot into your community workflow involves starting the bot, registering its slash commands, and utilizing the powerful command-line interface for ongoing management:

1. **Start the bot:**
   ```bash
   node app.js
   ```
   The bot will start a web server and an interactive command-line interface.

2. **Register Discord Commands:**
   Run the following command in the bot's CLI:
   ```
   register-discord-commands
   ```
   This will register the `/update` slash command with Discord for each configured community.

3. **Link an account:**
   Direct users to a URL like `http://localhost:3000/start/my_community` (replace `localhost:3000` with your bot's actual address and `my_community` with the name of your configured community). This will initiate the Discord and XAuthConnect OAuth flow.

4. **Use the `/update` Slash Command:**
   Users can now type `/update` in any Discord channel where the bot is present to refresh their linked role data.

5. **Interactive Commands:**
   Once the bot is running, you can type commands into the console:
   - `help`: Displays a list of available commands.
   - `list`: Lists all linked users from the database.
   - `prune`: Removes users from the database who are no longer in their respective Discord servers. Requires `guildId` and `botToken` in `config.json` and `GUILD_MEMBERS_READ` intent for the bot.
   - `refresh-all`: Refreshes the Discord linked role metadata for all users in the database.

### Exposing Your Bot to the Internet (for Discord Interactions)

For Discord to send interactions (like slash commands) to your bot, your bot's interaction endpoint must be publicly accessible. This is crucial for both local development and production deployments. Below are two common methods:

#### 1. Ngrok (for Local Development)

Ngrok creates a secure tunnel from a public endpoint to a locally running service. It's ideal for testing your bot during development.

1. **Install Ngrok:** Follow the instructions on the [Ngrok website](https://ngrok.com/download).
2. **Run Ngrok:** In your terminal, start Ngrok to expose your bot's port (default 3000):
   ```bash
   ngrok http 3000
   ```
3. **Copy Public URL:** Ngrok will provide a public HTTPS URL (e.g., `https://xxxx-xxxx-xxxx-xxxx.ngrok-free.app`).
4. **Update Discord Application:** Go to your Discord Developer Portal -> Your Application -> General Information, and set the "Interaction Endpoint URL" to your Ngrok public URL.
5. **Update `REDIRECT_URI`:** If you are using the OAuth2 flow, update the `REDIRECT_URI` in your bot's `.env` file to use the Ngrok public URL (e.g., `REDIRECT_URI=https://xxxx-xxxx-xxxx-xxxx.ngrok-free.app/discord/callback`).

#### 2. Cloudflare Tunnel (for Production/Stable Environments)

Cloudflare Tunnel securely connects your origin server (where your bot is hosted) to Cloudflare's network without exposing your IP address. It's a more robust solution for production.

1. **Install `cloudflared`:** Follow the instructions on the [Cloudflare Developers documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/).
2. **Authenticate `cloudflared`:** Run `cloudflared tunnel login` and follow the browser prompts.
3. **Create a Tunnel:** `cloudflared tunnel create <TUNNEL_NAME>`
4. **Create a Configuration File (`config.yml`):** Create a file (e.g., `~/.cloudflared/config.yml` or in your project directory) for your tunnel:
   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /home/.cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: your-bot-domain.com
       service: http://localhost:3000 # Or your bot's internal IP:port
     - service: http_status:404
   ```
   Replace `<TUNNEL_UUID>` with your tunnel's UUID and `your-bot-domain.com` with your desired public domain.
5. **Run the Tunnel:** `cloudflared tunnel run <TUNNEL_NAME>`
6. **Update Discord Application:** Go to your Discord Developer Portal -> Your Application -> General Information, and set the "Interaction Endpoint URL" to your public domain (e.g., `https://your-bot-domain.com/discord/interactions`).
7. **Update `REDIRECT_URI`:** Update the `REDIRECT_URI` in your bot's `.env` file to use your public domain (e.g., `REDIRECT_URI=https://your-bot-domain.com/discord/callback`).

## Contributing

Contributions are welcome and appreciated! Here's how you can contribute:

1. Fork the project on GitHub.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

Please make sure to update tests as appropriate and adhere to the existing coding style.

## License

This project is licensed under the CSSM Unlimited License v2.0 (CSSM-ULv2). See the [LICENSE](LICENSE) file for details.

# Discord XAuth Integration Bot

[![License](https://img.shields.io/badge/License-CSSM--ULv2-blue.svg)](LICENSE)

This project provides a Node.js bot to integrate Discord linked roles with an XAuthConnect authorization server. It allows users to link their Minecraft (XAuthConnect) account to their Discord profile, displaying their XAuth username as a linked role connection.

## Features

- **Discord Linked Roles Integration:** Connects user's XAuthConnect account to their Discord profile.
- **XAuth Username Display:** Shows the XAuth username in Discord's linked roles section.
- **Authorization Code Grant Flow:** Securely handles the OAuth2 authorization flow.
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

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/discord-xauth-integration.git
   cd discord-xauth-integration
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables (`.env` file):
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

4. **Configure Communities (`config.json` file):
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

1. **Start the bot:**
   ```bash
   node main.js
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

### Setting up Interaction Endpoint with Cloudflare Worker

Cloudflare Workers provide a robust, scalable, and globally distributed solution for handling Discord interactions, especially for production environments. They act as a proxy, receiving interactions from Discord, verifying their authenticity, and then forwarding them to your bot's actual server (which can be running locally or on a private VPS).

#### 1. Create a Cloudflare Worker

Go to your Cloudflare dashboard, navigate to "Workers & Pages", and create a new application. Choose "Create Worker".

#### 2. Worker Script

Use a script similar to the following. This script will verify the Discord signature and forward the interaction to your bot's backend. You will need to configure your bot's backend URL and the Discord Application Public Keys.

```javascript
// worker.js

// IMPORTANT: For a multi-community setup, you would typically store these public keys
// and bot backend URLs in Cloudflare Workers KV storage or as Worker secrets,
// indexed by the Discord Application ID (interaction.application_id).
// For this example, we'll use a simplified approach.

// Replace with your bot's actual backend URL (e.g., http://your-vps-ip:3000/discord/interactions)
// If running locally, you'd still need a tunnel (like ngrok) from your local machine to a public endpoint,
// and the Worker would forward to that public endpoint.
const BOT_BACKEND_URL = "http://localhost:3000/discord/interactions"; // Replace with your bot's actual backend URL

// Map of Discord Application ID to its Public Key
// You will need to populate this map with the clientId and publicKey from your config.json
const DISCORD_PUBLIC_KEYS = {
  "YOUR_DISCORD_CLIENT_ID_1": "YOUR_DISCORD_APPLICATION_PUBLIC_KEY_1",
  "YOUR_DISCORD_CLIENT_ID_2": "YOUR_DISCORD_APPLICATION_PUBLIC_KEY_2",
  // Add all your configured Discord Applications here
};

async function verifySignature(request, publicKey) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.clone().arrayBuffer();

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    hexToUint8Array(publicKey),
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    'Ed25519',
    key,
    hexToUint8Array(signature),
    encoder.encode(timestamp + new TextDecoder().decode(body))
  );
}

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const interactionBody = await request.clone().json();
  const clientId = interactionBody.application_id;

  const publicKey = DISCORD_PUBLIC_KEYS[clientId];

  if (!publicKey) {
    return new Response('Public Key not found for this Application ID', { status: 401 });
  }

  const isValid = await verifySignature(request, publicKey);

  if (!isValid) {
    return new Response('Invalid Signature', { status: 401 });
  }

  // Handle PING (Discord sends PINGs to verify the endpoint)
  if (interactionBody.type === 1) { // PING
    return new Response(JSON.stringify({ type: 1 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Forward to your bot server
  const botResponse = await fetch(BOT_BACKEND_URL, {
    method: 'POST',
    headers: request.headers, // Forward all headers, including signature
    body: await request.text() // Forward the raw body
  });

  return botResponse;
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
```

#### 3. Deploy the Worker

Deploy your Worker script. Cloudflare will provide a public URL for your Worker (e.g., `https://your-worker-name.your-username.workers.dev`).

#### 4. Update Discord Application's Interaction Endpoint URL

- Copy the public URL of your deployed Cloudflare Worker.
- Go to your Discord Developer Portal -> Your Application -> General Information.
- Set the "Interaction Endpoint URL" to your Worker's URL: `https://your-worker-name.your-username.workers.dev`.

#### 5. Update `REDIRECT_URI` in your bot's `.env`

If your bot's backend is running on a public server, update the `REDIRECT_URI` in your bot's `.env` file to reflect its public address (e.g., `REDIRECT_URI=http://your-vps-ip:3000/discord/callback`). If your bot is still running locally and you are using `ngrok` to expose it, the `BOT_BACKEND_URL` in the Worker script should point to your `ngrok` URL, and your bot's `REDIRECT_URI` should also use the `ngrok` URL.

#### 6. Test

Now, when you use a slash command in Discord, it should be routed through your Cloudflare Worker to your bot.


## License

This project is licensed under the CSSM Unlimited License v2.0 (CSSM-ULv2). See the [LICENSE](LICENSE) file for details.

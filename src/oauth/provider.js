import axios from 'axios';
import { randomBytes, createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

export class XAuthConnect {
    constructor(options) {
        this.options = options;
    }

    getAuthorizationUrl({ state, code_verifier }) {
        const code_challenge = createHash('sha256').update(code_verifier).digest('base64url');
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.options.clientId,
            redirect_uri: this.options.redirectUri,
            scope: this.options.scopes.join(' '),
            state: state,
            code_challenge: code_challenge,
            code_challenge_method: 'S256'
        });
        return `${this.options.authorizationUrl}?${params.toString()}`;
    }

    async getAccessToken({ code, code_verifier }) {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', this.options.redirectUri);
        params.append('client_id', this.options.clientId);
        params.append('client_secret', this.options.clientSecret);
        params.append('code_verifier', code_verifier);

        const response = await axios.post(this.options.tokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data;
    }

    async getResourceOwner(token) {
        const response = await axios.get(this.options.userinfoUrl, {
            headers: {
                'Authorization': `Bearer ${token.access_token}`
            },
            // Disable keep-alive for compatibility with PocketMine server
            httpAgent: new http.Agent({ keepAlive: false }),
            httpsAgent: new https.Agent({ keepAlive: false }),
        });
        return new XAuthConnectUser(response.data);
    }
}

class XAuthConnectUser {
    constructor(response) {
        this.response = response;
    }

    getId() {
        return this.response['profile:uuid'] ?? this.response.sub ?? this.response.id;
    }

    getNickname() {
        return this.response['profile:nickname'] ?? this.response.username;
    }

    toArray() {
        return this.response;
    }
}

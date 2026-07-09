import { Issuer, type Client, generators } from "openid-client";

let _client: Client | null = null;

export function getCallbackUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  const domain = domains[0] ?? process.env.REPLIT_DEV_DOMAIN;
  if (!domain) throw new Error("Could not determine callback domain");
  return `https://${domain}/api/auth/callback`;
}

export async function getOidcClient(): Promise<Client> {
  if (_client) return _client;

  const issuerUrl = process.env.DECARGO_ID_ISSUER_URL;
  if (!issuerUrl) throw new Error("DECARGO_ID_ISSUER_URL not set");

  const clientId = process.env.DECARGO_ID_CLIENT_ID;
  if (!clientId) throw new Error("DECARGO_ID_CLIENT_ID not set");

  const clientSecret = process.env.DECARGO_ID_CLIENT_SECRET;
  if (!clientSecret) throw new Error("DECARGO_ID_CLIENT_SECRET not set");

  const issuer = await Issuer.discover(issuerUrl);

  _client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [getCallbackUrl()],
    response_types: ["code"],
  });

  return _client;
}

export { generators };

// Usage: CLOUDFLARE_API_TOKEN=... node scripts/analytics.mjs <account-id> <script-name> <since-iso> [until-iso]
// Reads Durable Object invocations and periodic WebSocket counters from the GraphQL Analytics API.
const [accountTag, scriptName, since, until = new Date().toISOString()] = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token || !accountTag || !scriptName || !since) {
  console.error("Usage: CLOUDFLARE_API_TOKEN=... node scripts/analytics.mjs <account-id> <script-name> <since-iso> [until-iso]");
  process.exit(1);
}

const query = `
  query Probe($accountTag: string!, $scriptName: string!, $since: Time!, $until: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        invocations: durableObjectsInvocationsAdaptiveGroups(
          limit: 100
          filter: { scriptName: $scriptName, datetime_geq: $since, datetime_leq: $until }
        ) {
          sum { requests errors }
          dimensions { name type status }
        }
        periodic: durableObjectsPeriodicGroups(
          limit: 100
          filter: { datetime_geq: $since, datetime_leq: $until }
        ) {
          sum { inboundWebsocketMsgCount outboundWebsocketMsgCount }
          dimensions { name namespaceId }
        }
      }
    }
  }
`;

const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { accountTag, scriptName, since, until } }),
});
const body = await response.json();
if (body.errors?.length) {
  console.error(JSON.stringify(body.errors, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(body.data.viewer.accounts[0], null, 2));

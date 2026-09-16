// Usage: node scripts/rate-limit.mjs <worker-origin> [hits]
// Calls the Rate Limiting binding <hits> times (default 30) against a limit of 10 per 60 s.
const [origin, hitsArg = "30"] = process.argv.slice(2);
const hits = Number(hitsArg);
if (!origin || !Number.isInteger(hits) || hits < 1) {
  console.error("Usage: node scripts/rate-limit.mjs <worker-origin> [hits]");
  process.exit(1);
}

const results = [];
for (let i = 1; i <= hits; i += 1) {
  const response = await fetch(`${origin}/rate-limit`);
  results.push(response.status);
}

const allowed = results.filter((status) => status === 200).length;
const limited = results.filter((status) => status === 429).length;
console.log(JSON.stringify({ hits, allowed, limited, firstLimitedAt: results.indexOf(429) + 1 || null, statuses: results.join(",") }));

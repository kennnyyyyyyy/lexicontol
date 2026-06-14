// lexicontol — OpenAI proxy (Cloudflare Worker)
// Browser → this Worker → OpenAI. The API key lives here as a Secret, never in the browser.
//
// Deploy: dash.cloudflare.com → Workers & Pages → Create → Worker, paste this code.
// Secret: Settings → Variables and Secrets → add Secret `OPENAI_API_KEY` = your OpenAI key.
// Then put the Worker's URL into js/ai.js (the PROXY_URL constant).

const ALLOWED_ORIGINS = new Set([
  "https://kennnyyyyyyy.github.io", // GitHub Pages site
  "http://localhost:8000",          // optional: local testing
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(origin) });
    }
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405, headers: cors(origin) });
    }
    // Basic abuse gate: only your own site may use this proxy
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response("forbidden origin", { status: 403, headers: cors(origin) });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "bad body" }), { status: 400, headers: cors(origin) });
    }

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`, // the Secret
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text(); // pass OpenAI's response straight through
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...cors(origin) },
    });
  },
};

function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://kennnyyyyyyy.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

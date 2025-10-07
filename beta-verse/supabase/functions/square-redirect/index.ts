// supabase/functions/square-redirect/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

/**
 * This HTTPS page hands off to the native app:
 * Square -> https://<project>.supabase.co/functions/v1/square-redirect
 *         -> (JS) luxebets://wallet/checkout-complete
 */
export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: cors() });

  // Optional: forward query params to the app (not required for MVP)
  const url = new URL(req.url);
  const qp = url.searchParams.toString();
  const appUrl = `luxebets://wallet/checkout-complete${qp ? "?" + qp : ""}`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Opening LuxeBets…</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0; url='${appUrl}'" />
  <style>
    body{background:#0e0a12;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
    a{color:#ffd700}
    .card{max-width:520px;padding:24px;border:1px solid rgba(255,255,255,0.15);border-radius:12px;background:rgba(25,25,25,0.95);text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <h2>Returning to LuxeBets…</h2>
    <p>If you’re not redirected automatically, tap below:</p>
    <p><a href="${appUrl}">Open LuxeBets</a></p>
  </div>
  <script>
    // Try JS redirect too (for browsers that ignore meta refresh):
    window.location.replace(${JSON.stringify(appUrl)});
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", ...cors() },
  });
}

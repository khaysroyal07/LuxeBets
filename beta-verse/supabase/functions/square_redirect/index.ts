// supabase/functions/square_redirect/index.ts
// Simple confirmation page after Square payment redirect

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve((req: Request): Response => {
  // Square may append ?orderId=...&transactionId=... in production.
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  const txId = url.searchParams.get("transactionId") ?? "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Deposit complete</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #613DC1 0, #0B1020 45%, #02040A 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: rgba(10, 10, 20, 0.95);
      border-radius: 18px;
      padding: 24px 20px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 18px 40px rgba(0,0,0,0.55);
      text-align: center;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: rgba(255,255,255,0.8);
      margin-bottom: 20px;
    }
    .pill {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      background: rgba(97,61,193,0.18);
      border: 1px solid rgba(255,255,255,0.12);
      margin-bottom: 14px;
    }
    .btn {
      display: inline-block;
      margin-top: 16px;
      padding: 10px 18px;
      border-radius: 999px;
      background: linear-gradient(135deg, #FFD700, #FFB347);
      color: #1A1130;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
    }
    .hint {
      margin-top: 12px;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="pill">Payment successful</div>
    <div class="title">Wallet deposit confirmed</div>
    <div class="subtitle">
      Your payment was processed successfully.
      You can safely close this tab and return to the LuxeBETS app.
    </div>

    ${
      orderId
        ? `<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:6px;">
             Order ID: ${orderId}
           </div>`
        : ""
    }
    ${
      txId
        ? `<div style="font-size:12px;color:rgba(255,255,255,0.5);">
             Transaction ID: ${txId}
           </div>`
        : ""
    }

    <!-- If you later set up deep links like betaverse://wallet/success, update this href -->
    <a class="btn" href="javascript:window.close()">Close this tab</a>
    <div class="hint">
      If this tab doesn't close automatically, just close it to return to your app.
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
});

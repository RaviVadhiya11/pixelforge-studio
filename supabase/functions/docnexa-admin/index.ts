const allowedOrigins = new Set(["https://pixelfirestudio.in", "https://www.pixelfirestudio.in"]);
const encoder = new TextEncoder();

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://pixelfirestudio.in";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function secretKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.default) return parsed.default;
    } catch { /* use legacy fallback */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server secret is unavailable. Check Edge Function environment.");
}
function publishableKey(): string {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.default) return parsed.default;
    } catch { /* use legacy fallback */ }
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase publishable key is unavailable.");
}
async function authenticateAdmin(req: Request): Promise<{ email: string; adminKey: string }> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Please sign in again.");
  const token = authorization.slice(7);
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("Supabase URL is not configured.");
  const userResponse = await fetch(url + "/auth/v1/user", {
    headers: { "apikey": publishableKey(), "Authorization": "Bearer " + token },
  });
  if (!userResponse.ok) throw new Error("Your sign-in session is invalid or expired.");
  const user = await userResponse.json();
  const email = String(user.email || "").trim().toLowerCase();
  const allowedAdmins = (Deno.env.get("DOCNEXA_ADMIN_EMAILS") || "")
    .split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowedAdmins.includes(email)) throw new Error("This account is not authorized as a DocNexa administrator.");
  return { email, adminKey: secretKey() };
}
async function listUsers(adminKey: string, page: number, perPage: number) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const response = await fetch(url + "/auth/v1/admin/users?page=" + page + "&per_page=" + perPage, {
    headers: { "apikey": adminKey, "Authorization": "Bearer " + adminKey },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.msg || body.message || "Could not load user accounts.");
  return Array.isArray(body.users) ? body.users : [];
}
function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function getGoogleAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claims;
  const pem = String(serviceAccount.private_key || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  if (!pem) throw new Error("Firebase service-account private key is missing.");
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(unsigned)));
  const assertion = unsigned + "." + base64url(signature);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) throw new Error("Google could not authorize the Firebase messaging request.");
  return tokenBody.access_token;
}
async function sendNotification(title: string, body: string): Promise<string> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Firebase service account secret is not configured in Supabase.");
  let account: Record<string, string>;
  try { account = JSON.parse(raw); } catch { throw new Error("Firebase service account secret is not valid JSON."); }
  if (account.project_id !== "docnexa-f428d") throw new Error("Firebase service account belongs to a different project.");
  const accessToken = await getGoogleAccessToken(account);
  const response = await fetch("https://fcm.googleapis.com/v1/projects/docnexa-f428d/messages:send", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        topic: "docnexa_announcements",
        notification: { title, body },
        data: { type: "admin_announcement" },
        android: { priority: "NORMAL", notification: { channel_id: "important_updates" } },
      },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Firebase rejected the notification.");
  return String(result.name || "accepted");
}

async function getGoogleAnalyticsToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claims;
  const pem = String(serviceAccount.private_key || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  if (!pem) throw new Error("GA4 service-account private key is missing.");
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(unsigned)));
  const assertion = unsigned + "." + base64url(signature);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) throw new Error("Google could not authorize the GA4 reporting request.");
  return tokenBody.access_token;
}
async function getAnalyticsReport() {
  const raw = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GA4 service account secret is not configured in Supabase.");
  let account: Record<string, string>;
  try { account = JSON.parse(raw); } catch { throw new Error("GA4 service account secret is not valid JSON."); }
  if (!account.client_email || !account.private_key) throw new Error("GA4 service account JSON is missing required credentials.");
  if (account.project_id !== "docnexa-f428d") throw new Error("GA4 service account belongs to a different Google Cloud project.");
  const accessToken = await getGoogleAnalyticsToken(account);
  const response = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/564388958:runReport", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "sessions" },
      ],
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    const detail = result.error?.message || "Google Analytics rejected the report request.";
    throw new Error(detail);
  }
  const values = result.totals?.[0]?.metricValues || result.rows?.[0]?.metricValues || [];
  const numberAt = (index: number) => Number(values[index]?.value || 0);
  return {
    period: "Last 7 days",
    activeUsers: numberAt(0),
    totalUsers: numberAt(1),
    screenPageViews: numberAt(2),
    sessions: numberAt(3),
    propertyId: "564388958",
    generatedAt: new Date().toISOString(),
  };
}


function dateParts(date: Date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
async function getAdMobAccessToken(): Promise<string> {
  const clientId = Deno.env.get("ADMOB_CLIENT_ID");
  const clientSecret = Deno.env.get("ADMOB_CLIENT_SECRET");
  const refreshToken = Deno.env.get("ADMOB_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("AdMob OAuth secrets are not fully configured in Supabase.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    console.error("AdMob OAuth token refresh failed:", result.error || response.status);
    throw new Error("Google could not authorize AdMob reports. Check the AdMob OAuth secrets and consent.");
  }
  return result.access_token;
}
async function getAdMobReport() {
  const accessToken = await getAdMobAccessToken();
  const accountsResponse = await fetch("https://admob.googleapis.com/v1/accounts", {
    headers: { "Authorization": "Bearer " + accessToken },
  });
  const accountsBody = await accountsResponse.json();
  if (!accountsResponse.ok) {
    console.error("AdMob accounts lookup failed:", accountsBody.error?.message || accountsResponse.status);
    throw new Error("Could not read the AdMob publisher account. Check API access and the OAuth account.");
  }
  const accounts = Array.isArray(accountsBody.account) ? accountsBody.account : [];
  const account = accounts.find((item: Record<string, unknown>) => typeof item.name === "string" && item.name.startsWith("accounts/"));
  if (!account || typeof account.name !== "string") {
    throw new Error("No AdMob publisher account was found for the authorized Google account.");
  }
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 7));
  const reportResponse = await fetch("https://admob.googleapis.com/v1/" + account.name + "/networkReport:generate", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      reportSpec: {
        dateRange: { startDate: dateParts(start), endDate: dateParts(end) },
        metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS", "IMPRESSION_RPM"],
        localizationSettings: { currencyCode: "INR", languageCode: "en-IN" },
      },
    }),
  });
  const reportBody = await reportResponse.json();
  if (!reportResponse.ok) {
    console.error("AdMob report request failed:", reportBody.error?.message || reportResponse.status);
    throw new Error("AdMob rejected the report request. Check reporting access and try again later.");
  }
  const rows = Array.isArray(reportBody) ? reportBody.filter((item: Record<string, unknown>) => item.row).map((item: Record<string, any>) => item.row) : [];
  const sumMetric = (name: string, field: "integerValue" | "microsValue") =>
    rows.reduce((total: number, row: Record<string, any>) => total + Number(row.metricValues?.[name]?.[field] || 0), 0);
  const earningsMicros = sumMetric("ESTIMATED_EARNINGS", "microsValue");
  const impressions = sumMetric("IMPRESSIONS", "integerValue");
  const clicks = sumMetric("CLICKS", "integerValue");
  const ecpmMicros = sumMetric("IMPRESSION_RPM", "microsValue");
  return {
    period: "Last 7 days",
    currency: "INR",
    estimatedEarnings: earningsMicros / 1000000,
    impressions,
    clicks,
    ecpm: ecpmMicros / 1000000,
    publisherAccount: account.name,
    generatedAt: new Date().toISOString(),
  };
}

async function writeAudit(adminKey: string, email: string, action: string, title = "", messageId = "") {
  const url = Deno.env.get("SUPABASE_URL")!;
  const response = await fetch(url + "/rest/v1/docnexa_admin_audit", {
    method: "POST",
    headers: {
      "apikey": adminKey,
      "Authorization": "Bearer " + adminKey,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ admin_email: email, action, title, fcm_message_id: messageId }),
  });
  if (!response.ok) console.error("Audit insert failed:", await response.text());
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  try {
    const admin = await authenticateAdmin(req);
    const input = await req.json();
    const action = String(input.action || "");
    if (action === "overview") {
      const users = await listUsers(admin.adminKey, 1, 100);
      return json({
        totalUsers: users.length,
        totalUsersLabel: users.length === 100 ? "100+" : String(users.length),
        recentUsers: users.slice().sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || "")).slice(0, 5),
        analyticsConnected: Boolean(Deno.env.get("GA4_SERVICE_ACCOUNT_JSON")),
        admobConnected: Boolean(Deno.env.get("ADMOB_CLIENT_ID") && Deno.env.get("ADMOB_CLIENT_SECRET") && Deno.env.get("ADMOB_REFRESH_TOKEN")),
      }, 200, origin);
    }
    if (action === "analytics_report") {
      const report = await getAnalyticsReport();
      return json({ ok: true, report }, 200, origin);
    }
    if (action === "admob_report") {
      const report = await getAdMobReport();
      return json({ ok: true, report }, 200, origin);
    }
    if (action === "users") {
      const page = Math.max(1, Math.min(10000, Number(input.page) || 1));
      const users = await listUsers(admin.adminKey, page, 25);
      return json({
        users: users.map(u => ({
          id: u.id, email: u.email, created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at, email_confirmed_at: u.email_confirmed_at,
        })),
        hasMore: users.length === 25,
      }, 200, origin);
    }
    if (action === "send_notification") {
      const title = String(input.title || "").trim();
      const body = String(input.body || "").trim();
      if (!title || title.length > 80 || !body || body.length > 500) {
        return json({ error: "Enter a title (1–80 characters) and message (1–500 characters)." }, 400, origin);
      }
      const messageId = await sendNotification(title, body);
      await writeAudit(admin.adminKey, admin.email, "send_fcm_topic", title, messageId);
      return json({ ok: true, messageId }, 200, origin);
    }
    if (action === "audit") {
      const url = Deno.env.get("SUPABASE_URL")!;
      const response = await fetch(url + "/rest/v1/docnexa_admin_audit?select=id,admin_email,action,title,fcm_message_id,created_at&order=created_at.desc&limit=50", {
        headers: { "apikey": admin.adminKey, "Authorization": "Bearer " + admin.adminKey },
      });
      const rows = await response.json();
      if (!response.ok) throw new Error("Could not load admin activity. Run the DocNexa admin SQL setup first.");
      return json({ rows }, 200, origin);
    }
    return json({ error: "Unknown admin action." }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("not authorized") ? 403 : message.includes("sign in") || message.includes("session") ? 401 : 400;
    return json({ error: message }, status, origin);
  }
});
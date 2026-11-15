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
        analyticsConnected: false,
        admobConnected: false,
      }, 200, origin);
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
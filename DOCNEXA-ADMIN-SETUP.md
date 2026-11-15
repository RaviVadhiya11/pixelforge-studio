# DocNexa Admin Dashboard

The static dashboard is published at:

- https://pixelfirestudio.in/docnexa-admin/

The dashboard uses Supabase Auth for sign-in and calls the server-side Supabase Edge Function named `docnexa-admin`. It must never contain a Supabase secret/service-role key or a Firebase service-account private key.

## 1. Deploy the private audit table

Open the Supabase project SQL Editor for project `xayptkukxsmogxsnpnpa` and run the contents of:

`supabase/migrations/20261115_docnexa_admin_audit.sql`

The table has Row Level Security enabled and no client policies. Only the trusted server-side function uses the service key.

## 2. Create the Edge Function

In Supabase Dashboard, open Edge Functions and create a function named:

`docnexa-admin`

Copy the full source from:

`supabase/functions/docnexa-admin/index.ts`

Deploy it with JWT verification enabled (the default). The function independently validates the Supabase user and checks the administrator email allowlist.

## 3. Add Edge Function secrets

In Supabase Dashboard → Edge Functions → Secrets, add:

- `DOCNEXA_ADMIN_EMAILS`: the exact email address of the DocNexa Supabase Auth administrator account. Multiple addresses may be comma-separated.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete JSON contents of the Firebase service-account file for project `docnexa-f428d`.

Do not paste either secret into GitHub, the dashboard HTML, or a public chat. Do not use a Firebase client config file; this must be a service-account JSON downloaded from Firebase/Google Cloud service accounts. The service account needs permission to send Firebase Cloud Messaging messages.

Supabase supplies its project URL and server-side key material to Edge Functions automatically. The dashboard uses only the existing Supabase publishable key, which is designed for browser use.

## 4. Enable the dashboard

GitHub Pages serves this folder from the existing custom domain. After this branch is merged into `main`, open:

`https://pixelfirestudio.in/docnexa-admin/`

Sign in using an existing Supabase Auth account whose email is included in `DOCNEXA_ADMIN_EMAILS`.

## 5. Current dashboard scope

- Admin-only sign-in (server-side email allowlist)
- Supabase Auth user list and recent sign-ups
- FCM topic announcement composer with a confirmation step
- Private audit log of notification sends

The Analytics and AdMob cards are intentionally marked as pending until their separate reporting APIs and credentials are configured. The app's Firebase SDK connection and an AdMob ad-unit ID do not by themselves grant a web dashboard access to user analytics or revenue reports.

## 6. AdMob app-ads.txt

The root file `app-ads.txt` authorizes the publisher ID already present in the Android app's AdMob application ID. In AdMob, verify that the app's developer website is set to `https://pixelfirestudio.in` and that the app-ads.txt status is checked after Google crawls the site.

## Security notes

- Never put Firebase service-account JSON, Supabase secret keys, AdMob OAuth client secrets, or refresh tokens in static HTML or the Android app.
- The notification action sends immediately to all devices subscribed to `docnexa_announcements`; it cannot be recalled.
- Do not enable public sign-up for an admin-only account solely for this dashboard. Create/verify the admin account through the existing trusted Supabase Auth process.
- Keep Firebase/Supabase user data access limited to the administrator.

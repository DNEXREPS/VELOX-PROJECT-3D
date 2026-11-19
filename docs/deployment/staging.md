# Staging deployment (Vercel + hosted Supabase)

Everything in this guide is a **manual step performed by a project owner**. Nothing has been
deployed or applied to a hosted project yet. Do the steps in order; each has a check.

> Never run `supabase db reset` or the test suites (`npm run test:db`, `tests/e2e/*`) against a
> hosted project. They create and delete users and objects. The security E2E refuses to run
> against a non-local Supabase URL.

## 0. What you need

| Item | Where it comes from |
| --- | --- |
| Supabase **staging** project (separate from production) | supabase.com → New project |
| Vercel project for staging | vercel.com → Add New → Project → import `velox-project-3d` |
| A domain or the Vercel URL for staging | e.g. `staging.velox.example` or `velox-staging.vercel.app` |
| SMTP provider credentials | Postmark / Resend / SES / SendGrid … (see step 2.4) |
| `openssl` (to generate `CRON_SECRET`) | local machine |

## 1. Database (hosted Supabase)

1. Install and log in: `npx supabase login`
2. Link the repository to the **staging** project:
   `npx supabase link --project-ref <staging-project-ref>`
3. Preview what will run, without applying it:
   `npm run db:push:dry`
   Expected on a new project: migrations `20261118000100` … `20261118000800`.
   On an existing staging database: only the migrations it does not have yet.
4. Apply: `npx supabase db push`
   All migrations are additive. CI enforces this in `tests/unit/security-guards.test.ts`: no dropped tables, columns or schemas, and no truncations. `0800_hardening` adds:
   - a `private` schema
   - triggers
   - functions
   - one narrower storage policy
   - a `NOT VALID` check constraint (existing rows are not rewritten)
5. Optional demo catalogue (only on an **empty** staging database): run `supabase/seed.sql` in the SQL editor.
   It inserts the categories and the clearly labelled demo components.
6. **Check:** Project Settings → API → *Exposed schemas* must be `public, graphql_public` only. Do **not** expose `private`: it holds the rate-limit counters and the cleanup queue.
7. **Check:** Storage shows the buckets `bicycle-media` (private), `avatars` (public) and `maintenance-media` (private).

## 2. Authentication settings (Supabase dashboard)

1. **Authentication → URL Configuration**
   - *Site URL*: `https://<staging-domain>`
   - *Redirect URLs*:
     - `https://<staging-domain>/auth/callback`
     - Vercel preview deployments, if wanted: `https://*-<vercel-team-slug>.vercel.app/auth/callback`
2. **Authentication → Providers → Email**
   - *Confirm email*: **on**
   - *Secure email change*: on
   - *Minimum password length*: **10**
   - *Password requirements*: letters and digits

   These match `supabase/config.toml`.
3. **Authentication → Emails → Templates**: paste the HTML from:
   - `supabase/templates/confirmation.html` → "Confirm signup"
   - `supabase/templates/recovery.html` → "Reset password"
   - `supabase/templates/email_change.html` → "Change email address"

   They link to `/auth/confirm?token_hash=…&type=…`, which shows a button and redeems the one-time token only on that POST. Corporate mail scanners (Safe Links, Defender, Proofpoint) pre-fetch every link with GET and would otherwise use up reset and confirmation links before the recipient clicks. Unlike the default PKCE links, these also work when the email is opened in a different browser.

   Do **not** keep Supabase's default `{{ .ConfirmationURL }}` links: they redeem the token on GET.
4. **Authentication → Emails → SMTP Settings**: configure custom SMTP.
   Supabase's built-in mailer only delivers to members of the Supabase organisation and is heavily rate-limited. It is not usable for testers.
5. **Authentication → Rate Limits**: review the email, sign-in and sign-up limits. App-level limits for posts, comments and reports are enforced in the database (migration 0800).

## 3. Vercel project

Cron jobs only run on a Vercel project's **production** deployment. Use a **separate Vercel project for staging** whose production branch is your staging branch, so the cleanup cron runs there.

1. Framework preset: Next.js. Node.js 22. Build command `npm run build` (default).
2. **Environment variables** for this staging project's Production environment:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key (Project Settings → API) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<staging-domain>` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role / secret key. **Mark as Sensitive.** Server only, used only by `/api/cron/storage-cleanup` |
   | `CRON_SECRET` | `openssl rand -hex 32`. Mark as Sensitive |
   | `IMAGE_HOSTS_ALLOWLIST` | optional: comma-separated hosts for external component images |
   | `MONITORING_WEBHOOK_URL` / `MONITORING_WEBHOOK_TOKEN` | optional (see step 5) |

   For **Preview** deployments:
   - Leave `NEXT_PUBLIC_SITE_URL` unset; the stable branch URL is used.
   - Omit `SUPABASE_SERVICE_ROLE_KEY` unless previews need the cron. Previews build untrusted branches.
3. Validate locally before deploying, with the values in a git-ignored file:
   `npm run env:check -- --target production --file .env.staging.local`
   It never prints values and fails on, for example, a service key placed in the public anon variable.
4. Deploy. The `vercel.json` cron calls `/api/cron/storage-cleanup` daily at 04:17 UTC. On Vercel Pro you can make it hourly (`17 * * * *`).

## 4. Smoke test on staging (manual)

| Check | How | Expected |
| --- | --- | --- |
| Security headers | `curl -sI https://<staging-domain>/` | `content-security-policy` with a fresh `nonce-…` per request, plus HSTS, `X-Frame-Options: DENY`, `nosniff` and COOP |
| No CSP violations | Browser devtools console on `/`, `/explore`, a passport and the studio | No "Refused to …" messages; the 3D model renders |
| Sign-up confirmation | Register with a real inbox | Email arrives; the link signs you in at `/dashboard` |
| Password reset | `/forgot-password` | Link opens `/auth/confirm`; the button leads to `/reset-password`; the new password works; reusing the link fails. A `curl` of the link beforehand does not invalidate it |
| Uploads | Upload a photo; try a renamed SVG | Photo shown; SVG rejected |
| Deletion cleanup | Delete a bike with photos | Storage → `bicycle-media/<user>/<bike>/` is empty within seconds |
| Cron | `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging-domain>/api/cron/storage-cleanup` | JSON summary; without the header: `401` |
| Rate limit | Publish 6 posts within 10 minutes | 6th shows "You're doing that too often" |
| Monitoring | Vercel → Logs, search `"source":"velox"` | Structured events (e.g. `post.create.rate_limited`); no emails, tokens or serial numbers |

## 5. Firewall rule for the anonymous monitoring endpoint (recommended)

`/api/monitoring/client-error` accepts anonymous browser reports. The app limits it per instance:
- 10 reports per client per 10 minutes
- identical reports logged once per 5 minutes
- 60 log lines per instance per minute
- 2 KB bodies, strict schema

For a hard limit across all serverless instances, add a platform rule. Vercel → Project → Firewall → Configure → New rule:

| Field | Setting |
| --- | --- |
| Condition | path equals `/api/monitoring/client-error` |
| Action | Rate limit, e.g. 20 requests / 60 s per IP |
| On limit | respond with 429 |

The app never stores or logs client addresses for this endpoint. It keeps only an in-memory salted hash for rate limiting.

## 6. Monitoring and alerting

Events are single-line JSON (`"source":"velox"`) on stderr:
- Server errors through `src/instrumentation.ts`.
- Unexpected database errors through `fromDbError`.
- Storage failures.
- The cleanup cron.
- Browser beacons for 3D load failures, WebGL context loss and render errors.

To get alerts, choose one:
- **Vercel Log Drain** → Sentry, Axiom, Datadog or Better Stack. Filter on `level:"error"`. No code change.
- `MONITORING_WEBHOOK_URL`: the server POSTs each event (JSON, 2 s timeout) to an HTTPS endpoint you control.

Suggested alerts:
- any `level:"error"`
- `op:"storage_cleanup.job"` with `outcome:"failed"` (needs an operator)
- a spike of `*.rate_limited`
- `client_report.saturated`: the monitoring endpoint is being flooded
- `client.3d-load`

## 7. Operations

- **Failed storage cleanup jobs**: inspect with
  `select * from private.storage_cleanup_jobs where status = 'failed';`
  Fix the cause, then requeue with service-role SQL:
  `select public.retry_failed_storage_cleanup();`
- **Moderators**: `update public.profiles set role = 'moderator' where username = '…';`
- **Rollback**: Vercel → Deployments → *Instant Rollback*. Migrations are additive, so an older app build keeps working with the newer schema.
- **Production** later: repeat this guide with a separate Supabase project and Vercel project. Do not reuse staging keys.

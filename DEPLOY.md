# Put S&S Software on the internet

This is the path for tonight. Do these in order. You do not need to change the code.

The demo on your computer keeps using the sample shop and the password `squish-demo`. That password does not work on the live site.

## Before you start

This project is not on GitHub yet. Vercel can only deploy from GitHub, GitLab, or Bitbucket.

1. In Cursor, click **Create repo** and make a **private** GitHub repository.
2. Wait until the code is on GitHub. You will pick that repository inside Vercel.

Do not make the repository public. It has no customer list, but it is still your back office.

## 1. GitHub

You need a GitHub account. The private repo from the step above is the one Vercel will read. You do not upload the sample database or the `storage` folder. Those stay on your computer.

## 2. Database (Neon or Vercel Postgres)

The live site cannot use the database file on your computer. Create a free hosted Postgres database.

**Neon** is the simpler free choice.

1. Go to [https://neon.tech](https://neon.tech) and create a free account.
2. Create a project. Name it something like `sparkle-squish`.
3. Neon shows two connection strings. Copy both somewhere safe.
   - **Pooled** connection. The host name contains the word `pooler`. This is `DATABASE_URL`.
   - **Direct** connection. The host name does not contain `pooler`. This is `DIRECT_URL`.
4. If a string does not already end with `?sslmode=require`, add that to the end.

Vercel Postgres is the other free choice. In the Vercel dashboard, open **Storage**, create a Postgres database, and connect it to the project in step 4. Vercel then fills `DATABASE_URL` for you. Also copy the **non-pooling** URL into `DIRECT_URL`. Migrations fail if they are sent through the pooler.

## 3. File storage (Cloudflare R2)

Photos, invoice PDFs, and the nightly backup cannot live on Vercel’s disk. That disk is wiped. Use a private bucket.

Cloudflare R2 has a free tier and works with the settings this app already has. Vercel Blob’s current file API only makes **public** files, so it is the wrong place for invoices and original photos. Use R2.

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com) and create a free account.
2. Open **R2** and create a bucket. Name it something like `sparkle-squish`. Leave it private.
3. Create an **R2 API token** that can read and write that bucket.
4. On the token page, copy:
   - Access Key ID
   - Secret Access Key
   - The S3 endpoint, which looks like `https://YOUR_ACCOUNT_ID.r2.cloudflare.com`

You will paste these into Vercel in step 5.

## 4. Vercel project

1. Go to [https://vercel.com](https://vercel.com) and create a free account with the same GitHub login.
2. Click **Add New → Project** and import the GitHub repository from step 1.
3. Leave the framework as Next.js. Do not change the build command. The repo’s `vercel-build` script creates the database tables, then builds the site.
4. Do not deploy yet. Add the environment variables in the next step first, then deploy.

## 5. Environment variables

In the Vercel project, open **Settings → Environment Variables**. Add every row. Use the **Production** environment.

| Name | Where the value comes from |
| --- | --- |
| `DATABASE_URL` | Neon’s **pooled** connection string, or the pooled URL from Vercel Postgres. |
| `DIRECT_URL` | Neon’s **direct** connection string (no `pooler` in the host), or Vercel’s non-pooling URL. If you only have one URL, paste that same URL here too. |
| `OWNER_EMAIL` | The email you will type on the sign-in page. |
| `OWNER_PASSWORD` | A password you choose, at least 10 characters. Do not use `squish-demo`. |
| `SESSION_SECRET` | A new random string, at least 24 characters. On your computer run `openssl rand -base64 32` and paste the result. |
| `APP_URL` | The live address, with `https://` and no slash at the end. After the first deploy this is the `.vercel.app` address Vercel shows. You can deploy once, copy that address, set `APP_URL`, and redeploy. |
| `SHOPIFY_STORE_DOMAIN` | `mw4ti4-tj.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | The client id from the Dev Dashboard app’s Settings page. |
| `SHOPIFY_CLIENT_SECRET` | The client secret from that same page. |
| `SHOPIFY_ADMIN_TOKEN` | Leave blank. Only fill this if you still have an older app that shows an `shpat_` token. |
| `SHOPIFY_WEBHOOK_SECRET` | The same client secret. |
| `SHOPIFY_API_VERSION` | `2026-10` |
| `CRON_SECRET` | Another random string from `openssl rand -base64 32`. Vercel sends it when the daily jobs run. |
| `S3_ENDPOINT` | The R2 S3 endpoint, such as `https://YOUR_ACCOUNT_ID.r2.cloudflare.com`. |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | The R2 bucket name. |
| `S3_ACCESS_KEY_ID` | The R2 access key id. |
| `S3_SECRET_ACCESS_KEY` | The R2 secret access key. |
| `S3_FORCE_PATH_STYLE` | `true` |

Then click **Deploy**.

The build runs the database migration. You do not run a migration by hand.

## 6. Shopify app in the Dev Dashboard

The app does not change products until you turn a switch on inside S&S Software. New Dev Dashboard apps do not show an Admin API token. They show a client id and a client secret. This app trades those for a token that lasts 24 hours.

1. Open the Dev Dashboard and create the app, or open the one you already created.
2. Open **Versions** and create a version.
3. Set the **App URL** to `https://sparkle-squish-app-f2ok.vercel.app`. You do not need a redirect URL. This login does not send anyone back to the app.
4. Set the webhooks API version to **2026-10**.
5. Add the scopes below, then **Release** the version.
6. On the app’s home, choose **Install app**, pick `mw4ti4-tj.myshopify.com`, and approve the permissions.
7. Open the app’s **Settings** and copy the **Client ID** and **Client secret** into Vercel as `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.
8. Put that same client secret in `SHOPIFY_WEBHOOK_SECRET`.
9. Leave `SHOPIFY_ADMIN_TOKEN` blank unless you still have an older app that shows an `shpat_` token.
10. Redeploy so Vercel picks up the new variables.

After that, open **Settings** in S&S Software. It should say **Shopify connected** and list the permissions. If the app is not installed, or a permission is missing, it says so in plain English.

### Scopes to turn on

A write scope already includes the matching read. You do not also turn on the read version.

| Scope | Why |
| --- | --- |
| `write_products` | Read the catalog. Save the title, price, and S&S metafields. Never writes Shopify’s own SKU or barcode boxes. |
| `write_inventory` | Read on-hand counts. Add stock when you receive. Set a cycle count. Update unit cost. |
| `write_files` | Upload the S&S branded photos. |
| `read_orders` | Read sales and refunds, and receive order and refund webhooks. |
| `read_locations` | Tell the online shop apart from The Squishy Shop. |

Optional, only if you want orders older than 60 days:

| Scope | Why |
| --- | --- |
| `read_all_orders` | Extends `read_orders`. Shopify has to approve this request. |

Do **not** turn on `write_orders`. This app does not create or edit orders.

You do not need customer scopes. The import does not read customer names or addresses.

### Webhooks

After `APP_URL` is the real https address, either:

- In the Dev Dashboard, subscribe these topics to `https://YOUR-APP-URL/api/webhooks/shopify` as JSON: `orders/create`, `orders/paid`, `refunds/create`, `products/update`, `inventory_levels/update`.

or

- In the deployed site, open **Settings**, dry-run **Register Shopify webhooks**, then turn that switch on.

Every webhook is checked with the API secret. A bad signature is rejected.

## 7. First sign-in

1. Open the Vercel address.
2. Sign in with `OWNER_EMAIL` and `OWNER_PASSWORD`.
3. If you left the password blank on purpose, the first page asks you to choose an email and password once. Do that before you send the link to anyone else. Whoever opens a blank site first becomes the owner.
4. Press **Import from Shopify**. That only reads.
5. Leave every Shopify write switch off until you have read a dry-run and it looks right. The order is in the main README: product details, photos, receiving stock, receiving cost, then cycle count last.

Do not press **Reload the sample shop**. That button is hidden once the Shopify token is set.

## Scheduled jobs

`vercel.json` runs two jobs on the free Vercel plan, which only allows one run per day for each:

- `/api/cron/reconcile` at 13:00 UTC, about 7am Chicago. Pulls stock and orders from Shopify. It does not overwrite your prices, costs, or S&S codes.
- `/api/cron/backup` at 08:00 UTC, about 2am Chicago. Writes a JSON backup into the R2 bucket.

Use **Reconcile now** in Settings when you want a sync right away.

A paid Vercel plan can run the sync every 15 minutes. Change the reconcile schedule in `vercel.json` to `*/15 * * * *` only after that plan is on. The free plan will reject that schedule.

## Invoice zip size

Vercel’s free plan rejects a single upload larger than about 4.5 MB. A zip of all 103 invoice files may be bigger than that. If the import refuses the zip, split it into a few smaller zips and import each one. The import updates the same invoices and does not attach a file twice.

## If the deploy fails

- **Migration** or **database** errors: `DIRECT_URL` is missing or it is the pooled URL. Use the direct Neon host for `DIRECT_URL`.
- **SESSION_SECRET**: it must be at least 24 characters. Generate a new one. Do not reuse a short placeholder.
- **Photos or invoices disappear**: the R2 variables are blank or `S3_FORCE_PATH_STYLE` is not `true`.
- **Shopify says the token is wrong**: the token was copied once. If you lost it, install the custom app again and reveal a new token. Do not change the scopes while you are doing that unless a scope from the table is missing.

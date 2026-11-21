# S&S Software

S&S Software is the back office for Sparkle & Squish. Shopify stays the website, the register, and checkout. This app is the place the owner works from: products, suppliers, purchase orders, receiving, counts, barcodes, and the day’s sales.

The shop:

- Public site: [sparklesquishshop.com](https://sparklesquishshop.com)
- Shopify store: `mw4ti4-tj.myshopify.com`
- Plan: Basic
- Money: US dollars
- Time: America/Chicago
- Garage register: The Squishy Shop (Shopify POS)

## What belongs where

S&S Software owns the product name and details, the S&S SKU, the S&S barcode, the price, the cost, purchase orders, suppliers, and the original photos.

Shopify owns the live stock count, the sales, the refunds, POS, and the online listing.

Receiving **adds** the number of pieces that arrived. It never types a new total over the old one. A shelf count only sets a total when that item did not sell while the count was open.

Shopify’s own SKU box and barcode box stay the **supplier’s** SKU and UPC. This app never writes those boxes. The S&S codes live in variant metafields:

- `custom.s_s_sku` — for example `SS-SQ-043-STD`, or `SS-SQ-111-STD-1` when there is more than one
- `custom.s_s_barcode` — an in-store EAN-13 that starts with 2 and has a valid check digit

The series already in use runs through `2000000003467`. The next new barcode is `2000000003474`. A code is never reused, and the series only moves forward.

Barcode lookup matches the S&S barcode, the supplier barcode, the S&S SKU, or the supplier SKU.

## Try it on your computer

You do not need a Shopify password for the demo. The sample shop is already filled in.

1. Install Node.js 22 from [https://nodejs.org](https://nodejs.org).
2. Open Terminal (Mac) or Command Prompt, and go into this folder.
3. Run:

```bash
npm install
npm run setup
npm run dev
```

4. Open [http://127.0.0.1:43123](http://127.0.0.1:43123).
5. Sign in. The demo fills this in for you:

- Email: `owner@sparklesquish.shop`
- Password: `squish-demo`

`npm run setup` creates a local database, loads the sample catalog, and copies `.env.example` to `.env` if you do not have one yet.

## Connect the real Sparkle & Squish shop

Leave the demo token blank until you are ready. When you connect the live shop, start from an empty database. Do not press “Reload the sample shop” after the live token is in place. That button is hidden once the token is set, and the seed command refuses to run.

### 1. Create the app in Shopify

Shopify no longer lets a store create a brand-new custom app from the old admin screen. Use the Dev Dashboard. The app still gives you an Admin API token, which is all this software needs.

1. Sign in to the Shopify admin for Sparkle & Squish.
2. Go to **Settings → Apps and sales channels**.
3. Open **Develop apps** (it may send you to the Dev Dashboard).
4. Create an app named **S&S Software**.
5. Open the app’s **Admin API** scopes and turn on only the ones in the list below.
6. Install the app on this store.
7. Reveal the **Admin API access token** and copy it. Shopify shows it once.
8. Copy the app’s **API secret key**. That is the webhook secret.

### 2. Scopes to turn on

Turn these on. A write scope already includes the matching read, so you do not also need the read version.

| Scope | Why |
| --- | --- |
| `write_products` | Product title, price, and the S&S metafields |
| `write_inventory` | Add received stock, set a cycle count, update unit cost |
| `write_files` | Send S&S branded photos with `fileCreate` and `fileUpdate` |
| `read_orders` | Sales and refunds from the last 60 days |
| `read_locations` | Tell the online shop apart from The Squishy Shop |

Optional, only if you want history older than 60 days:

| Scope | Why |
| --- | --- |
| `read_all_orders` | Extends `read_orders` to older orders. Shopify has to approve this. |

Do not turn on `write_orders`. This app does not create or change orders.

The API version is **2026-10**. Variant barcodes are read from the `barcodes` list (the old single `barcode` field is still read, and is never written). Stock receipts use `inventoryAdjustQuantities` with a delta. S&S codes are written with `metafieldsSet`. Photos use `stagedUploadsCreate`, then `fileCreate` or `fileUpdate`. When the product is already linked, the branded photo is also added to the product with `productVariantsBulkUpdate` media, which does not touch the SKU or barcode.

### 3. Fill in the environment

Copy `.env.example` to `.env` if setup did not already do that. Then set:

| Name | What to put |
| --- | --- |
| `DATABASE_URL` | Leave `file:../data/ss.db` on your computer. On Vercel, use the Postgres URL. |
| `OWNER_EMAIL` | The email you sign in with. |
| `OWNER_PASSWORD` | A password only you know. |
| `SESSION_SECRET` | A long random string. This locks the sign-in cookie. |
| `APP_URL` | The public address of this app, with no slash at the end. |
| `SHOPIFY_STORE_DOMAIN` | `mw4ti4-tj.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | The Admin API token from the step above. Leave blank for the demo. |
| `SHOPIFY_WEBHOOK_SECRET` | The app’s API secret key. |
| `SHOPIFY_API_VERSION` | `2026-10` |
| `CRON_SECRET` | Another long random string. Vercel sends it when the scheduled jobs run. |
| `S3_ENDPOINT` | Only if photos live in S3 or Cloudflare R2. |
| `S3_REGION` | `auto` is fine for R2. Use the AWS region for S3. |
| `S3_BUCKET` | The bucket name. |
| `S3_ACCESS_KEY_ID` | The storage key. |
| `S3_SECRET_ACCESS_KEY` | The storage secret. |
| `S3_FORCE_PATH_STYLE` | `true` for some R2 and MinIO setups. Otherwise leave blank. |

On your own computer, photos and the nightly backup file stay in the `storage` folder. That folder is not uploaded anywhere. On Vercel the disk is temporary, so set the S3 values or the photos and backups will disappear.

### 4. Webhooks

In the Dev Dashboard, subscribe these topics to `https://YOUR-APP-URL/api/webhooks/shopify` as JSON:

- `orders/create`
- `orders/paid`
- `refunds/create`
- `products/update`
- `inventory_levels/update`

Or, after the app is deployed, open **Settings**, dry-run **Register Shopify webhooks**, then turn that switch on. While the switch is off, nothing is sent. The audit log keeps both the preview and any live call.

Every webhook is checked with the HMAC signature in `X-Shopify-Hmac-Sha256`. A bad signature is rejected.

### 5. Turn writes on one at a time

Every write to Shopify has a switch. They all start **off**. While a switch is off, the app still saves your work locally and shows the exact GraphQL it would have sent. That preview is also written to the audit log.

A sensible order:

1. In Settings, press **Import from Shopify**. That only reads.
2. Open a product and read the Shopify preview. Confirm the supplier SKU and supplier barcode are not in it.
3. Turn on **Product details, price, and S&S identifiers**.
4. Turn on **S&S branded photos** when you are ready for those pictures to leave this app.
5. Turn on **Receiving adds stock**, then **Receiving updates unit cost**.
6. Turn on **Cycle count sets quantity** last. A count is skipped if the item sold, or was received, while the count was open.

**Reconcile now** pulls stock, vendor identifiers, and orders back from Shopify. It does not overwrite your prices, costs, or S&S codes. A scheduled reconcile runs about every 15 minutes once the app is deployed (see below).

## Put it on Vercel

1. Create a Postgres database. Neon and Vercel Postgres both work. Copy the connection string.
2. On your computer, in this folder, run `npm run use-postgres`. That changes one word in `prisma/schema.prisma` from `sqlite` to `postgresql`.
3. In the Vercel project, set every variable from the table above. `DATABASE_URL` is the Postgres string. `APP_URL` is the Vercel address, such as `https://ss-software.vercel.app`.
4. Set the build command to:

```bash
npx prisma generate && npx prisma db push && next build
```

5. Deploy. The file `vercel.json` already schedules:

- Reconcile: every 15 minutes (`/api/cron/reconcile`)
- Backup: 2:00am Chicago time, which is 08:00 UTC (`/api/cron/backup`)

Vercel’s Hobby plan only runs a cron once a day. The 15-minute reconcile needs a plan that allows that schedule. Until then, use **Reconcile now** in Settings. Set `CRON_SECRET` either way. Vercel sends it as `Authorization: Bearer …`.

6. Open the deployed site, sign in, and press **Import from Shopify**. Do not load the sample catalog on the live database.

The nightly backup is a JSON file of products, suppliers, purchase orders, counts, and sales. It does not include the Shopify token. On Vercel it is stored in the S3 bucket when those variables are set.

## Bring over the old prototype

Open **CSV import** (also linked from Settings). There is a sample file for products, suppliers, and purchase orders.

If a row already has `ss_sku` and `ss_barcode`, those values are kept when they are valid and not already used. Otherwise the app assigns the next S&S SKU and the next barcode. The barcode counter then moves to whichever code is further along, and it never moves backward.

## Checks you can run

```bash
npm test
```

The tests cover:

- S&S SKU format, including `SS-SQ-111-STD-1`, and not reusing a SKU
- EAN-13 check digits, continuing `2000000003467` to `2000000003474` and then `2000000003481`, and never reusing a barcode
- Weighted-average cost
- Receiving as an added quantity, not a replaced total
- A cycle count that refuses to set stock after a sale
- Shopify webhook HMAC checks
- Proof that supplier SKU and supplier barcode values are absent from every Shopify write

## Day to day

- **Home** is today’s sales, cost, and margin, split between online and The Squishy Shop.
- **Inventory** is the card desk: products, receiving, counts, lookup, suppliers, and labels.
- **Scan** looks up whatever you scan.
- New products get the next S&S SKU and the next barcode on their own.
- Original photos stay here. Branded photos are the ones that can go to Shopify.
- Purchase orders are draft, then ordered, then partial or received. Scan a barcode on the order to check a line in.
- Labels download as a PDF of S&S barcodes.
- **Data quality** lists duplicate S&S SKUs, duplicate S&S barcodes, and missing costs. The sample shop includes a few of these on purpose, the way the live shop does today.

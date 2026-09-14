# Workshop Shop

A small, editable ecommerce application for workshops. It has a browser frontend, shop API, PostgreSQL database, PostgREST data gateway, and separate mock payment service. The application source is mounted into prebuilt Node containers, so there are no application image builds.

## Run locally

Run the complete local stack from this directory:

```bash
docker compose up
```

### GitHub Codespaces

This repository runs in Codespaces without building application images. Open
the repository in a Codespace, then run:

```bash
make up
```

When the command finishes, open the forwarded port `8088` from the Ports panel.
The shop source is bind-mounted into the Node containers, so edits to the
frontend are visible after a browser refresh. Restart the stack after editing
`server.js` or `payment.js`:

```bash
make down && make up
```

Start generated traffic in another terminal with:

```bash
make load
```

The load run lasts 60 seconds. It uses only public prebuilt images; the first
startup downloads images but does not compile the workshop application.

Open http://localhost:8088. The stack has four services: shop, payment, PostgreSQL, and PostgREST.

Run the generated workload in a second terminal:

```bash
docker compose --profile loadgen up load-generator
```

The load generator uses the prebuilt `grafana/k6` image and runs catalog,
multi-item cart, and checkout traffic for 60 seconds. With Podman Compose, use
the equivalent `--profile loadgen` command and the Podman image path configured
by your local setup.

Edit `frontend/index.html`, `frontend/app.js`, or `frontend/styles.css`, then refresh the browser. Edit `server.js` or `payment.js`, then restart only the relevant Node container.

PostgreSQL is initialized from `db/init.sql`. Reset it with `docker compose down -v`. The payment service approves every non-zero charge and is intentionally for teaching only.

## Problem scenarios

Each problem is implemented on its own branch. The branches keep the same
service names and browser workflow, so you can run the same manual steps or
load profile against the healthy baseline and a broken version.

Start a scenario from a fresh checkout with:

```bash
git fetch origin
git switch --detach origin/scenario/n-plus-one
docker compose up
```

Replace the branch name with `scenario/db-pool-exhaustion` or
`scenario/payment-duplicate`. With Podman, use the equivalent
`podman-compose` command described by your local Podman setup.

### N+1 database queries

Branch: `scenario/n-plus-one`

Trigger it by adding several different products to the cart and opening the
cart page repeatedly. Under load, send concurrent cart requests with carts that
contain multiple products.

The cart endpoint first reads the cart rows and then performs one product query
per cart item. A cart with six products therefore creates one cart query plus
six product queries instead of one combined query.

Expected symptoms:

- Cart latency increases as the number of products increases.
- PostgreSQL query volume grows linearly with cart size.
- Trace waterfalls show repeated product database calls beneath one cart request.
- PostgreSQL database time and connection activity increase before the app has
	a corresponding increase in useful work.
- The structured shop log includes `event=cart_product_lookups`,
	`cartItems`, `productQueries`, and `queryPattern=N+1`.

Browser experience:

- The product page normally works.
- The cart eventually loads more slowly, especially with several items.
- The browser does not usually show an explicit error; this is primarily a
	latency and database-efficiency problem.

### Database pool exhaustion

Branch: `scenario/db-pool-exhaustion`

Trigger it with concurrent requests to the catalog, cart, or checkout API. A
browser alone may not generate enough traffic, so use a load generator or a
burst of parallel requests. The branch intentionally limits the shop API to
two database slots and adds a small delay to each database operation.

Expected symptoms:

- Requests queue briefly and then fail when both slots are occupied.
- Shop logs contain `event=database_pool_exhausted`, `poolSize=2`, and the
	database URL being requested.
- Traces show requests failing before or while waiting for database access.
- HTTP error rate and latency rise together.
- PostgreSQL itself may remain healthy; the exhausted resource is the shop
	API's intentionally undersized pool.

Browser experience:

- Product or cart sections may remain in a loading state briefly.
- Some requests return an error response, which the UI may display as a failed
	catalog/cart load or an empty section depending on the current page.
- Refreshing may work intermittently because the two slots become available
	again.

### Duplicate payment transaction

Branch: `scenario/payment-duplicate`

Add an item to the cart and complete checkout. The first payment request creates
a transaction but delays its response long enough for checkout to time out.
Checkout retries the request, and the payment service creates a second
transaction for the same order.

Expected symptoms:

- One order has two different payment transaction IDs.
- Payment logs contain a first record with `event=payment_transaction_created`,
	`attempt=1`, and `transactionId`.
- The retry contains the same `orderId`, `attempt=2`, a new `transactionId`,
	and `duplicateOf` set to the first transaction ID.
- The shop log contains `event=payment_timeout_retrying` with the order ID.
- Traces show a payment timeout followed by a second successful payment call.

Browser experience:

- The checkout page normally says the order was paid successfully.
- The user may see only one order confirmation, even though two charges were
	created.
- This is intentionally a silent business failure: the UI can look healthy
	while logs and traces reveal the duplicate transaction.

### Suggested workshop sequence

1. Run `main` and record normal catalog, cart, checkout, latency, and payment
	 telemetry.
2. Run `scenario/n-plus-one` and compare cart traces with different cart sizes.
3. Run `scenario/db-pool-exhaustion` and increase concurrency until errors
	 appear.
4. Run `scenario/payment-duplicate` and query payment logs by `orderId` and
	 `event=payment_transaction_created`.

The most useful fields to retain in observability queries are `orderId`,
`transactionId`, `duplicateOf`, `attempt`, `cartItems`, `productQueries`, and
`poolSize`.

The k6 requests are tagged with `workload=workshop-shop`, `operation`, and
`user_id`, which makes it easier to filter generated traffic separately from
browser traffic.

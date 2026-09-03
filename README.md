# Workshop Shop

A small, editable ecommerce application for workshops. It has a browser frontend, shop API, PostgreSQL database, PostgREST data gateway, and separate mock payment service. The application source is mounted into prebuilt Node containers, so there are no application image builds.

## Run locally

Run the complete local stack from this directory:

```bash
docker compose up
```

Open http://localhost:8088. The stack has four services: shop, payment, PostgreSQL, and PostgREST.

Edit `frontend/index.html`, `frontend/app.js`, or `frontend/styles.css`, then refresh the browser. Edit `server.js` or `payment.js`, then restart only the relevant Node container.

PostgreSQL is initialized from `db/init.sql`. Reset it with `docker compose down -v`. The payment service approves every non-zero charge and is intentionally for teaching only.

## Scenario branch

The `scenario/n-plus-one` branch intentionally performs one PostgreSQL product
query per cart item. Add several different products to a cart and watch the
`cart_product_lookups` log and database spans grow with cart size.

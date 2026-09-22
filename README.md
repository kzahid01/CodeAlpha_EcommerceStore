# Deskwork: Simple E-commerce Store

> CodeAlpha Full Stack Development Internship, **Task 1**

A full-stack online store for desk and workspace gear. Browse products, search and filter, add to a cart, register or log in, and place an order. Stock is tracked and orders are stored per user.

**Stack:** HTML, CSS and vanilla JavaScript on the frontend. Node.js, Express and SQLite (`better-sqlite3`) on the backend. Auth uses bcrypt password hashing and JWTs in an `httpOnly` cookie.

## Features

| Requirement | What is implemented |
|---|---|
| Product listings | 12 seeded products, category filter, search, sorting |
| Product details page | Large image tile, description, stock status, quantity picker |
| Shopping cart | Works for guests (kept in `localStorage`), quantity controls, live totals, stock clamping |
| User registration / login | Validated sign-up, bcrypt hashing, `httpOnly` JWT cookie, logout |
| Order processing | Server-side order creation in a DB transaction, order confirmation and order history |
| Database | SQLite tables: `users`, `products`, `orders`, `order_items` |

Design decisions worth mentioning in your video:

- **Prices are never trusted from the client.** The cart sends only product ids and quantities. The server looks up prices and computes the total.
- **No overselling.** Stock is decremented with an atomic `UPDATE ... WHERE stock >= ?` inside a transaction. If any line fails, the whole order rolls back.
- **XSS-safe rendering.** All dynamic text goes through an escaping `html` template tag.
- **Security basics:** `helmet` headers and a CSP, rate-limited auth routes, `SameSite=Lax` cookies, and input validation.
- **Payment is simulated.** Adding a real gateway (Stripe Checkout) would replace the `POST /api/orders` step.

## Run it locally

Requires Node.js 18 or newer.

```bash
git clone https://github.com/<your-username>/CodeAlpha_EcommerceStore.git
cd CodeAlpha_EcommerceStore
npm install
cp .env.example .env      # then set JWT_SECRET
npm start                 # http://localhost:3000
```

The SQLite database is created and seeded automatically on first run (`data/store.db`). Delete that file to reset.

Run the automated API tests with `npm test`.

## API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | | Create account `{ name, email, password }` |
| POST | `/api/auth/login` | | Log in `{ email, password }` |
| POST | `/api/auth/logout` | | Clear session cookie |
| GET | `/api/auth/me` | | Current user or `null` |
| GET | `/api/products` | | List. Query: `q`, `category`, `sort`, `ids` |
| GET | `/api/products/categories` | | Category names |
| GET | `/api/products/:id` | | Product details |
| POST | `/api/orders` | yes | Place order `{ items: [{ productId, quantity }], shipping: { name, address, city } }` |
| GET | `/api/orders` | yes | Your orders |
| GET | `/api/orders/:id` | yes | One of your orders |

## Project structure

```
server.js              Express app, security middleware, routing
src/db.js              Schema and seed data
src/auth.js            JWT cookie helpers and auth middleware
src/routes/            auth.js, products.js, orders.js
public/                index.html, css/styles.css, js/app.js (hash-routed SPA)
test/api.test.js       Node built-in test runner
```

## Using your own product images

Set `image_url` on a row in the `products` table (or add it to the seed list in `src/db.js`). When present it is shown instead of the emoji tile.

## Deploying

Any Node host works (Render, Railway, Fly.io). Set `NODE_ENV=production`, `JWT_SECRET`, and mount a persistent volume for `DB_PATH` because SQLite is a file.

## Ideas for extending it

Stripe payments, admin dashboard for products, order status updates, product reviews, and email receipts.

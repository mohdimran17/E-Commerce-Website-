# Zestora — Full-Stack E-Commerce Store

Node.js + Express + SQLite backend with a fast, dependency-free JavaScript front end.

## Run in VS Code

1. Install **Node.js 18+** (https://nodejs.org).
2. Open this folder in VS Code (`File → Open Folder`).
3. Open the terminal (`Ctrl + ~`) and run:

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start
```

4. Open **http://localhost:3000**

For auto-reload while editing: `npm run dev`.

**Admin login:** `admin@zestora.com` / `Admin@123` (change it in `.env` before deploying).

## Features

- Product catalogue: search, category filter, price filter, sorting, pagination
- Product page: discount badge, stock status, quantity, related products, reviews and ratings
- Cart: works for guests (saved in the browser) and merges into your account on login
- Wishlist, coupons (`WELCOME10`, `SAVE20`, `FESTIVE15`), free shipping above ₹999
- Checkout with address validation; COD works, UPI and Card are demo only
- Orders: history, cancel before shipping (stock is restored automatically)
- Admin panel: sales stats, low-stock alerts, add/edit/delete products, update order status
- Dark and light theme, responsive layout down to mobile

## Reliability and scalability

- Stock is checked and deducted inside a single database transaction, so two buyers can't oversell an item.
- All prices, discounts and totals are calculated on the server, never trusted from the browser.
- Passwords hashed with bcrypt, JWT sessions, Helmet security headers, rate limiting, parameterised SQL, HTML escaping on the front end.
- SQLite runs in WAL mode with indexes. To scale further, swap `db.js` for PostgreSQL and run several Node instances behind a load balancer (the server is stateless).

## Project structure

```
server.js        API routes, auth, validation, order logic
db.js            SQLite schema
seed.js          Demo products, coupons, admin user
public/
  index.html     App shell
  css/styles.css Theme and layout
  js/app.js      Router, views, cart, admin UI
```

## Using your own product images

Each product shows an emoji tile by default. To use real photos, open the Admin panel, click **Edit** on a product, and paste an image URL (https://…). If the URL fails to load, the emoji tile shows instead. To change the demo data, edit `seed.js` and delete `data.db` so it is re-created.

## Next steps for production

- Set a strong `JWT_SECRET` in `.env`.
- Integrate a real payment gateway (Razorpay or Stripe) in `POST /api/orders`.
- Serve behind HTTPS (Nginx, Render, Railway, etc.).

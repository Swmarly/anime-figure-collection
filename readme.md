# Kawaii Figure Vault

Kawaii Figure Vault is a personal playground for experimenting with a dreamy anime-themed figure gallery. The site pairs a static, highly polished front page with a lightweight Cloudflare Worker so the collection can be curated from anywhere without rebuilding the site.

## How the project fits together
- **Static gallery** – `index.html`, `styles.css`, and `script.js` render the public collection. The layout focuses on soft gradients, animated sparkles, and scroll-triggered reveals to give the page the feel of a collector's shrine.
- **Cloudflare Worker** – `worker.js` serves the static assets and exposes a JSON API that the gallery and admin panel talk to. When Cloudflare KV is configured it becomes the persistence layer; otherwise it falls back to an in-memory store so the project keeps working in development.
- **Admin console** – Everything inside `/admin` is a basic SPA that lets you sign in, search for figures, tweak the metadata, and push updates to the collection. Import helpers can pull information from MyFigureCollection to pre-fill the form, but nothing stops you from editing every field manually.

## Data flow
1. The browser loads the static gallery, which asks the Worker for the latest `owned` and `wishlist` arrays.
2. Signed-in admins manage the same data through the `/admin` interface. Saves go to the Worker, which writes to KV (or the transient in-memory store) and immediately returns the new payload to the front page.
3. Because everything is JSON, the admin console can export a backup file or rehydrate the UI on reload with minimal ceremony.

## Why it exists
This repository exists primarily as a public demo for friends who like anime figures. It is not packaged for reuse, but it shows how to combine a Cloudflare Worker, KV storage, and a static gallery to keep a personal collection fresh without a traditional backend.

## Tech stack
- Vanilla HTML, CSS, and JavaScript for the gallery experience
- Cloudflare Workers for hosting, API routing, and Basic Auth
- Cloudflare KV (optional) for persistence

Feel free to explore the code, borrow patterns, or fork it for your own display case. Just remember that the live demo uses sample credentials meant for local testing. Always replace secrets if you deploy a copy.

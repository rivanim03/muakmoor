# 🛒 Makmur Grosir

**Toko Grosir Online** — A simple, fast, mobile-friendly web store for browsing wholesale prices and placing orders directly via WhatsApp.

Customers can browse **2,500+ products** across 9 categories, search by name, add items to a cart, and send the complete order as a single WhatsApp message to the store owner — no app install needed.

---

## ✨ Features

- **📦 2,500+ Products** — Organized into 9 categories (food, drinks, spices, instant food, medicine, tobacco, soap, diapers, tools)
- **🔍 Live Search** — Filter products by name as you type
- **📱 Cart System** — Add/remove items, adjust quantities, persistent across page reloads
- **💬 WhatsApp Checkout** — One tap sends the entire order (with prices & totals) to the owner
- **🌙 Dark Mode** — Toggleable light/dark theme
- **🖼️ Auto Image Mapping** — Product images are automatically mined from e-commerce sites via GitHub Actions
- **⚡ Lazy Loading** — Images load on demand; falls back to category emoji if unavailable
- **📄 Pagination** — 30 products per page with category filtering

---

## 🧠 How It Works

```
📊 Excel (.xlsx) ──► generate_website_data.js ──► products-data.js (JSON)
                                                          │
                    ┌─────────────────────────────────────┤
                    │                                     │
                    ▼                                     ▼
          find_image_urls.js                      index.html + script.js
          (GitHub Action)                         (Customer-facing site)
                    │
                    ▼
          _mapping.json + image-mapping.js
          (correct product-ID-to-URL mapping)
```

### 🔄 Image Mining Pipeline (GitHub Actions)

The project includes an automated scraper that finds product images from **Lazada, Blibli, Shopee, and Tokopedia**:

1. **Product data** is generated from an Excel spreadsheet into `products-data.js`
2. A **Playwright bot** (`scripts/find_image_urls.js`) searches each product on 4 e-commerce sites
3. Images are scored by alt-text similarity, and the best match is saved to `_mapping.json`
4. Results are accumulated across runs — **50 products per batch, every 3 hours**
5. A live `_action.log` tracks every run's progress, successes, and failures

> 💡 *The "muakmoor" name comes from the original Excel filename — a playful take on "Makmur Grosir".*

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Installation

```bash
git clone https://github.com/rivanim03/muakmoor.git
cd muakmoor
npm install
```

### Run the Website (Locally)

Open `index.html` directly in a browser, or serve with any static server:

```bash
npx serve .
```

### Run the Image Finder

```bash
# Test with 10 products
npm run urls:test

# Process all pending products (batch of 50)
npm run urls:all

# Retry previously failed products
npm run urls:resume
```

---

## 📁 Project Structure

```
muakmoor/
├── index.html                 # Main storefront page
├── style.css                  # Responsive styling
├── script.js                  # Cart, search, UI logic
├── products-data.js           # 2,500+ products with pricing
├── package.json               # Dependencies & scripts
│
├── scripts/
│   ├── find_image_urls.js     # Playwright image scraper (GitHub Action)
│   └── migrate_mapping.js     # One-time ID re-indexing migration
│
├── .github/workflows/
│   └── find-image-urls.yml    # Scheduled GitHub Action (every 3h)
│
├── assets/images/
│   ├── _mapping.json          # Product-ID → image URL mapping
│   ├── _failed.json           # Products needing retry
│   ├── _action.log            # Run history log
│   └── image-mapping.js       # Auto-generated JS mapping (for the site)
│
└── DataBaseFormxlsx/
    ├── generate_website_data.js   # Excel → products-data.js converter
    └── generate_template.js       # Excel template generator
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML, CSS, Vanilla JS (no frameworks) |
| **Data** | Excel → `products-data.js` (JSON) |
| **Scraping** | Playwright (Chromium/Firefox) |
| **Automation** | GitHub Actions (scheduled + manual) |
| **Checkout** | WhatsApp API (`wa.me`) |

---

## 📄 License

ISC

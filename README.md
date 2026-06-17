# 🛒 Makmur Grosir

**Toko Grosir Online** — Website sederhana, cepat, dan ramah HP untuk melihat harga grosir dan memesan langsung via WhatsApp.

Pelanggan bisa browsing **2.500+ produk** dalam 9 kategori, mencari berdasarkan nama, menambah ke keranjang, dan mengirim seluruh pesanan sebagai satu pesan WhatsApp ke pemilik toko — tanpa perlu install aplikasi.

---

## ✨ Fitur

- **📦 2.500+ Produk** — Terbagi dalam 9 kategori (alat, makanan, minuman, bumbu, instanfood, obat, rokok, sabun, pampers)
- **🔍 Pencarian Langsung** — Filter produk berdasarkan nama saat mengetik
- **📱 Keranjang Belanja** — Tambah/hapus item, atur jumlah, tersimpan walau halaman di-refresh
- **💬 Checkout WhatsApp** — Satu klik kirim seluruh pesanan (dengan harga & total) ke pemilik toko
- **🌙 Mode Gelap** — Beralih tema terang/gelap
- **🖼️ Pencarian Gambar Otomatis** — Gambar produk dicari otomatis dari situs e-commerce via GitHub Actions
- **⚡ Lazy Loading** — Gambar dimuat sesuai kebutuhan; fallback ke emoji kategori jika tidak tersedia
- **📄 Paginasi** — 30 produk per halaman dengan filter kategori

---

## 🧠 Cara Kerja

```
📊 Excel (.xlsx) ──► generate_website_data.js ──► products-data.js (JSON)
                                                          │
                    ┌─────────────────────────────────────┤
                    │                                     │
                    ▼                                     ▼
          find_image_urls.js                      index.html + script.js
          (GitHub Action)                         (Tampilan pembeli)
                    │
                    ▼
          _mapping.json + image-mapping.js
          (pasangan ID-produk → URL gambar)
```

### 🔄 Pipeline Pencarian Gambar (GitHub Actions)

Proyek ini memiliki scraper otomatis yang mencari gambar produk dari **Lazada, Blibli, Shopee, dan Tokopedia**:

1. **Data produk** dibuat dari spreadsheet Excel ke `products-data.js`
2. **Bot Playwright** (`scripts/find_image_urls.js`) mencari setiap produk di 4 situs e-commerce
3. Gambar dinilai berdasarkan kesamaan alt-text, dan yang terbaik disimpan ke `_mapping.json`
4. Hasil dikumpulkan dari setiap proses — **50 produk per batch, setiap 3 jam**
5. File `_action.log` mencatat progres, keberhasilan, dan kegagalan setiap proses

> 💡 *Nama "muakmoor" berasal dari nama file Excel asli — plesetan dari "Makmur Grosir".*

---

## 🚀 Memulai

### Prasyarat

- [Node.js](https://nodejs.org/) v18+
- npm

### Instalasi

```bash
git clone https://github.com/rivanim03/muakmoor.git
cd muakmoor
npm install
```

### Menjalankan Website (Lokal)

Buka `index.html` langsung di browser, atau gunakan static server:

```bash
npx serve .
```

### Menjalankan Pencari Gambar

```bash
# Uji coba dengan 10 produk
npm run urls:test

# Proses semua produk yang belum memiliki gambar (batch 50)
npm run urls:all

# Ulangi produk yang sebelumnya gagal
npm run urls:resume
```

---

## 📁 Struktur Proyek

```
muakmoor/
├── index.html                 # Halaman utama toko
├── style.css                  # Styling responsif
├── script.js                  # Logika keranjang, pencarian, UI
├── products-data.js           # 2.500+ produk dengan harga
├── package.json               # Dependensi & script
│
├── scripts/
│   ├── find_image_urls.js     # Scraper gambar Playwright (GitHub Action)
│   └── migrate_mapping.js     # Migrasi perbaikan ID (satu kali)
│
├── .github/workflows/
│   └── find-image-urls.yml    # GitHub Action terjadwal (setiap 3 jam)
│
├── assets/images/
│   ├── _mapping.json          # Pasangan ID-produk → URL gambar
│   ├── _failed.json           # Produk yang perlu diulang
│   ├── _action.log            # Riwayat proses
│   └── image-mapping.js       # JS mapping otomatis (untuk website)
│
└── DataBaseFormxlsx/
    ├── generate_website_data.js   # Konverter Excel → products-data.js
    └── generate_template.js       # Pembuat template Excel
```

---

## 🛠️ Tech Stack

| Lapisan | Teknologi |
|---------|-----------|
| **Frontend** | HTML, CSS, Vanilla JS (tanpa framework) |
| **Data** | Excel → `products-data.js` (JSON) |
| **Scraping** | Playwright (Chromium/Firefox) |
| **Otomatisasi** | GitHub Actions (terjadwal + manual) |
| **Checkout** | WhatsApp API (`wa.me`) |

---

## 📄 Lisensi

ISC

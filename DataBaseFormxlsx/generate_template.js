const XLSX = require('xlsx');
const path = require('path');

// Buat workbook baru
const wb = XLSX.utils.book_new();

// Data header dan contoh
const data = [
    {
        "Nama Produk": "Beras Premium 5kg",
        "Harga": 65000,
        "Satuan": "karung",
        "Kategori": "sembako",
        "Icon": "🍚"
    },
    {
        "Nama Produk": "Minyak Goreng 1L",
        "Harga": 15000,
        "Satuan": "botol",
        "Kategori": "sembako",
        "Icon": "🫒"
    },
    {
        "Nama Produk": "Gula Pasir 1kg",
        "Harga": 14000,
        "Satuan": "kg",
        "Kategori": "sembako",
        "Icon": "🍬"
    },
    {
        "Nama Produk": "",
        "Harga": "",
        "Satuan": "",
        "Kategori": "",
        "Icon": ""
    },
    {
        "Nama Produk": "",
        "Harga": "",
        "Satuan": "",
        "Kategori": "",
        "Icon": ""
    }
];

// Buat worksheet
const ws = XLSX.utils.json_to_sheet(data);

// Atur lebar kolom
ws['!cols'] = [
    { wch: 30 },  // Nama Produk
    { wch: 12 },  // Harga
    { wch: 12 },  // Satuan
    { wch: 18 },  // Kategori
    { wch: 10 },  // Icon
];

// Tambahkan worksheet ke workbook
XLSX.utils.book_append_sheet(wb, ws, "Daftar Produk");

// Buat sheet kedua untuk panduan kategori
const panduanData = [
    { "Kategori": "sembako", "Keterangan": "Beras, minyak, gula, telur, tepung, dll" },
    { "Kategori": "makanan", "Keterangan": "Mie instan, snack, makanan ringan" },
    { "Kategori": "minuman", "Keterangan": "Kopi, teh, susu, air mineral" },
    { "Kategori": "bumbu", "Keterangan": "Kecap, sambal, bumbu masak" },
    { "Kategori": "perlengkapan", "Keterangan": "Sabun, shampo, pembersih" },
];

const ws2 = XLSX.utils.json_to_sheet(panduanData);
ws2['!cols'] = [
    { wch: 18 },
    { wch: 40 },
];
XLSX.utils.book_append_sheet(wb, ws2, "Panduan Kategori");

// Simpan file
const outputPath = path.join(__dirname, '..', 'daftar_produk.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ File berhasil dibuat: ${outputPath}`);
console.log('📋 Buka file daftar_produk.xlsx dan isi data produk Anda!');

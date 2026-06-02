const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Baca file Excel
const filePath = path.join(__dirname, '..', 'Daftar Produk.xlsx');
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets['Sheet'];
const data = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });

// Mapping kategori
const categoryMap = {
    'ALT': 'alat',
    'MKN': 'makanan',
    'MNM': 'minuman',
    'MINUMAN RENCENG': 'minuman',
    'BUMBU': 'bumbu',
    '2INSTANFOOD': 'instanfood',
    'OBAT': 'obat',
    'ROKOK': 'rokok',
    'SABUN': 'sabun',
    'PAMPERS/PEMBALUT': 'pampers'
};

const categoryNames = {
    'alat': 'Alat',
    'makanan': 'Makanan',
    'minuman': 'Minuman',
    'bumbu': 'Bumbu',
    'instanfood': 'Instant Food',
    'obat': 'Obat',
    'rokok': 'Rokok',
    'sabun': 'Sabun',
    'pampers': 'Pampers/Pembalut'
};

// Ikon berdasarkan kategori
const categoryIcons = {
    'alat': '🔧',
    'makanan': '🍜',
    'minuman': '🥤',
    'bumbu': '🌶️',
    'instanfood': '🍝',
    'obat': '💊',
    'rokok': '🚬',
    'sabun': '🧼',
    'pampers': '👶'
};

// Group by Nama Item
const productMap = new Map();
let idCounter = 1;

for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const nama = (row[1] || '').trim();
    const jenis = (row[2] || '').trim();
    const satuan = (row[3] || '').trim();
    const qtyPaket = parseFloat(row[4]) || 1;
    const subSatuan = (row[5] || '').trim();
    const harga = parseFloat(row[6]);

    if (!nama || isNaN(harga) || harga <= 0) continue;

    const key = nama.toUpperCase();
    const category = categoryMap[jenis] || 'lainnya';

    if (!productMap.has(key)) {
        productMap.set(key, {
            id: idCounter++,
            name: nama,
            category: category,
            icon: categoryIcons[category] || '📦',
            variants: []
        });
    }

    const product = productMap.get(key);
    
    // Cek apakah varian dengan satuan ini sudah ada
    const existingVariant = product.variants.find(v => v.unit === satuan);
    if (!existingVariant) {
        product.variants.push({
            unit: satuan,
            price: Math.round(harga),
            qty: qtyPaket,
            subUnit: subSatuan || satuan
        });
    }
}

// Konversi ke array
const products = Array.from(productMap.values());

// Sort by name
products.sort((a, b) => a.name.localeCompare(b.name, 'id'));

// Generate output JS
let output = `// ===== DATA PRODUK (Generated from Excel) =====
// Total: ${products.length} produk

const products = ${JSON.stringify(products, null, 2)};

// ===== KATEGORI =====
const categoryNames = ${JSON.stringify(categoryNames, null, 2)};

// Export untuk digunakan di script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { products, categoryNames };
}
`;

// Tulis ke file
const outputPath = path.join(__dirname, '..', 'products-data.js');
fs.writeFileSync(outputPath, output, 'utf-8');

console.log(`✅ Berhasil generate ${products.length} produk dari Excel!`);
console.log(`📁 File disimpan: products-data.js`);

// Statistik
const catStats = {};
products.forEach(p => {
    catStats[p.category] = (catStats[p.category] || 0) + 1;
});
console.log('\n📊 Statistik per kategori:');
Object.entries(catStats).sort((a,b) => b[1]-a[1]).forEach(([cat, count]) => {
    console.log(`   ${categoryNames[cat] || cat}: ${count} produk`);
});

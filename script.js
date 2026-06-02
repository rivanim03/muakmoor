// ===== DATA PRODUK (dari Excel) =====
// products-data.js harus di-load sebelum script.js

// ===== STATE =====
let cart = [];
let currentCategory = 'all';
let searchQuery = '';

// ===== DOM ELEMENTS =====
const productsGrid = document.getElementById('productsGrid');
const categoriesContainer = document.getElementById('categories');
const searchInput = document.getElementById('searchInput');
const cartBtn = document.getElementById('cartBtn');
const cartSidebar = document.getElementById('cartSidebar');
const cartOverlay = document.getElementById('cartOverlay');
const closeCart = document.getElementById('closeCart');
const cartItems = document.getElementById('cartItems');
const cartFooter = document.getElementById('cartFooter');
const totalPrice = document.getElementById('totalPrice');
const cartBadge = document.getElementById('cartBadge');
const checkoutBtn = document.getElementById('checkoutBtn');
const toast = document.getElementById('toast');

// ===== NOMOR WHATSAPP =====
const WA_NUMBER = "6285330124354";

// ===== KATEGORI =====
function loadCategories() {
    const cats = [...new Set(products.map(p => p.category))];
    
    // Pasang event listener untuk tombol "Semua"
    const semuaBtn = document.querySelector('.category-btn[data-category="all"]');
    if (semuaBtn) {
        semuaBtn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            semuaBtn.classList.add('active');
            currentCategory = 'all';
            renderProducts();
        });
    }
    
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = cat;
        btn.textContent = categoryNames[cat] || cat;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = cat;
            renderProducts();
        });
        categoriesContainer.appendChild(btn);
    });
}

// ===== CEK STATUS KERANJANG =====
function isProductInCart(productId) {
    return cart.some(item => item.productId === productId);
}

function getCartStatusText(productId) {
    const inCartItems = cart.filter(item => item.productId === productId);
    if (inCartItems.length === 0) return null;
    const totalQty = inCartItems.reduce((sum, item) => sum + item.qty, 0);
    return `${totalQty} di keranjang`;
}

// ===== RENDER PRODUK (DOM manipulation, lebih cepat dari innerHTML) =====
let cancelBatch = false;

function renderProducts() {
    const filtered = products.filter(p => {
        const matchCategory = currentCategory === 'all' || p.category === currentCategory;
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCategory && matchSearch;
    });

    if (filtered.length === 0) {
        productsGrid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>Tidak ada produk ditemukan</p>
            </div>
        `;
        return;
    }

    cancelBatch = true; // Batalkan batch sebelumnya
    productsGrid.innerHTML = '';
    let index = 0;
    const batchSize = 80;

    function renderNextBatch() {
        if (cancelBatch) return; // Dibatalkan karena render baru
        const fragment = document.createDocumentFragment();
        const batch = filtered.slice(index, index + batchSize);

        for (const product of batch) {
            fragment.appendChild(createProductCard(product));
        }

        productsGrid.appendChild(fragment);
        index += batchSize;

        if (index < filtered.length) {
            setTimeout(renderNextBatch, 8);
        }
    }

    cancelBatch = false;
    renderNextBatch();
}

// ===== UPDATE SATU KARTU PRODUK (tanpa render ulang semua) =====
function updateProductCard(productId) {
    const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (!card) return;

    const inCart = isProductInCart(productId);
    const cartText = getCartStatusText(productId);
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Toggle class in-cart
    card.classList.toggle('in-cart', inCart);

    // Update badge di gambar
    const imageEl = card.querySelector('.product-image');
    let badge = imageEl.querySelector('.in-cart-badge');
    if (inCart && !badge) {
        const newBadge = document.createElement('div');
        newBadge.className = 'in-cart-badge';
        newBadge.innerHTML = '<i class="fas fa-check-circle"></i>';
        imageEl.appendChild(newBadge);
    } else if (!inCart && badge) {
        badge.remove();
    }

    // Update tombol
    const btn = card.querySelector('.add-to-cart-btn');
    if (!btn) return;
    if (inCart) {
        btn.className = 'add-to-cart-btn in-cart-btn';
        btn.innerHTML = `<i class="fas fa-shopping-bag"></i> ${cartText}`;
    } else {
        btn.className = 'add-to-cart-btn';
        btn.innerHTML = '<i class="fas fa-plus"></i> Tambah';
    }
}

// ===== CHANGE VARIANT =====
function changeVariant(productId, select) {
    const selectedIdx = parseInt(select.value);
    const variant = products.find(p => p.id === productId).variants[selectedIdx];
    const priceEl = document.getElementById(`price-${productId}`);
    if (priceEl) {
        priceEl.innerHTML = `${formatPrice(variant.price)} <span class="product-unit">/ ${variant.unit}</span>`;
    }
}

function getSelectedVariant(productId) {
    const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (card) {
        const select = card.querySelector('.variant-select');
        if (select) {
            const idx = parseInt(select.value);
            return products.find(p => p.id === productId).variants[idx];
        }
    }
    return products.find(p => p.id === productId).variants[0];
}

// ===== FORMAT RUPIAH =====
function formatPrice(num) {
    return 'Rp ' + Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ===== KERANJANG =====
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const variant = getSelectedVariant(productId);
    const cartKey = `${productId}-${variant.unit}`;

    const existing = cart.find(item => item.cartKey === cartKey);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({
            cartKey: cartKey,
            productId: product.id,
            name: product.name,
            unit: variant.unit,
            price: variant.price,
            icon: product.icon,
            qty: 1
        });
    }

    updateCart();
    updateProductCard(productId);
    showToast(`${product.name} (${variant.unit}) ditambahkan`);
    animateCartBadge();
}

function removeFromCart(cartKey) {
    const productId = parseInt(cartKey.split('-')[0]);
    cart = cart.filter(item => item.cartKey !== cartKey);
    updateCart();
    updateProductCard(productId);
}

function updateQty(cartKey, change) {
    const item = cart.find(i => i.cartKey === cartKey);
    if (!item) return;

    item.qty += change;
    if (item.qty <= 0) {
        removeFromCart(cartKey);
    }
    updateCart();
}

function updateCart() {
    // Update badge
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    cartBadge.textContent = totalItems;

    // Update cart items
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="cart-empty">
                <i class="fas fa-shopping-bag"></i>
                <p>Keranjang masih kosong</p>
            </div>
        `;
        cartFooter.style.display = 'none';
        return;
    }

    cartFooter.style.display = 'block';

    cartItems.innerHTML = cart.map(item => {
        const imgPath = typeof getProductImage === 'function' ? getProductImage(item.productId) : null;
        const imgHtml = imgPath
            ? `<img src="${imgPath}" alt="${item.name}" class="cart-item-thumb" onerror="this.style.display='none'">`
            : `<span class="cart-item-icon">${item.icon}</span>`;
        return `
        <div class="cart-item">
            <div class="cart-item-image">${imgHtml}</div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-unit">${item.unit}</div>
                <div class="cart-item-price">${formatPrice(item.price)}</div>
            </div>
            <div class="cart-item-actions">
                <button class="qty-btn minus" onclick="updateQty('${item.cartKey}', -1)">−</button>
                <span class="qty-value">${item.qty}</span>
                <button class="qty-btn plus" onclick="updateQty('${item.cartKey}', 1)">+</button>
                <button class="delete-btn" onclick="removeFromCart('${item.cartKey}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    // Update total
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    totalPrice.textContent = formatPrice(total);
}

// ===== CHECKOUT VIA WHATSAPP =====
checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) {
        showToast('Keranjang masih kosong');
        return;
    }

    let message = `Halo *Makmur Grosir*, saya ingin memesan:\n\n`;
    
    cart.forEach((item, index) => {
        message += `${index + 1}. ${item.name} (${item.unit}) x${item.qty} = ${formatPrice(item.price * item.qty)}\n`;
    });

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    message += `\n*Total: ${formatPrice(total)}*\n\n`;
    message += `Nama: \nAlamat: \nNo. HP: \n\nTerima kasih.`;

    const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    
    // Close cart
    closeCartSidebar();
});

// ===== UI HELPERS =====
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

let badgeAnimating = false;
function animateCartBadge() {
    if (badgeAnimating) return;
    badgeAnimating = true;
    cartBadge.style.transform = 'scale(1.3)';
    setTimeout(() => {
        cartBadge.style.transform = 'scale(1)';
        badgeAnimating = false;
    }, 200);
}

function openCartSidebar() {
    cartSidebar.classList.add('open');
    cartOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCartSidebar() {
    cartSidebar.classList.remove('open');
    cartOverlay.classList.remove('open');
    document.body.style.overflow = '';
}

// ===== DEBOUNCE =====
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ===== EVENT LISTENERS =====
cartBtn.addEventListener('click', openCartSidebar);
closeCart.addEventListener('click', closeCartSidebar);
cartOverlay.addEventListener('click', closeCartSidebar);

// Search — debounce biar tidak render ulang setiap ketikan
const debouncedSearch = debounce(() => renderProducts(), 300);
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    debouncedSearch();
});

// ===== MEMBUAT SATU ELEMEN KARTU PRODUK =====
function createProductCard(product) {
    const variants = product.variants;
    const cheapest = variants.reduce((min, v) => v.price < min.price ? v : min, variants[0]);
    const hasVariants = variants.length > 1;
    const inCart = isProductInCart(product.id);
    const cartText = getCartStatusText(product.id);

    const card = document.createElement('div');
    card.className = `product-card ${inCart ? 'in-cart' : ''}`;
    card.dataset.productId = product.id;

    const imageDiv = document.createElement('div');
    imageDiv.className = 'product-image';
    
    // Try to load actual product image
    const imgPath = typeof getProductImage === 'function' ? getProductImage(product.id) : null;
    if (imgPath) {
        const img = document.createElement('img');
        img.className = 'product-img';
        img.src = imgPath;
        img.alt = product.name;
        img.loading = 'lazy';
        img.onerror = function() {
            // Fallback to emoji on error
            this.style.display = 'none';
            const fallback = document.createElement('span');
            fallback.className = 'product-img-fallback';
            fallback.textContent = product.icon;
            imageDiv.appendChild(fallback);
        };
        imageDiv.appendChild(img);
    } else {
        imageDiv.textContent = product.icon;
    }
    
    if (inCart) {
        const badge = document.createElement('div');
        badge.className = 'in-cart-badge';
        badge.innerHTML = '<i class="fas fa-check-circle"></i>';
        imageDiv.appendChild(badge);
    }
    card.appendChild(imageDiv);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'product-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'product-name';
    nameDiv.textContent = product.name;
    infoDiv.appendChild(nameDiv);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'product-price';
    priceDiv.id = `price-${product.id}`;
    priceDiv.innerHTML = `${formatPrice(cheapest.price)} <span class="product-unit">/ ${cheapest.unit}</span>`;
    infoDiv.appendChild(priceDiv);

    if (hasVariants) {
        const variantDiv = document.createElement('div');
        variantDiv.className = 'variant-selector';
        variantDiv.dataset.productId = product.id;
        const select = document.createElement('select');
        select.className = 'variant-select';
        select.onchange = function() { changeVariant(product.id, this); };
        variants.forEach((v, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.dataset.price = v.price;
            opt.dataset.unit = v.unit;
            opt.textContent = `${v.unit} ${v.qty > 1 ? `(${v.qty} ${v.subUnit})` : ''} - ${formatPrice(v.price)}`;
            select.appendChild(opt);
        });
        variantDiv.appendChild(select);
        infoDiv.appendChild(variantDiv);
    }

    const btn = document.createElement('button');
    btn.className = `add-to-cart-btn ${inCart ? 'in-cart-btn' : ''}`;
    btn.onclick = () => addToCart(product.id);
    if (inCart) {
        btn.innerHTML = `<i class="fas fa-shopping-bag"></i> ${cartText}`;
    } else {
        btn.innerHTML = '<i class="fas fa-plus"></i> Tambah';
    }
    infoDiv.appendChild(btn);

    card.appendChild(infoDiv);
    return card;
}

// ===== INIT =====
loadCategories();
renderProducts();
updateCart();

// ===== SWIPE TO CLOSE CART (mobile) =====
let touchStartY = 0;
let touchDiff = 0;
let isDragging = false;

cartSidebar.addEventListener('touchstart', (e) => {
    if (e.target.closest('.cart-items')) return;
    touchStartY = e.touches[0].clientY;
    isDragging = true;
}, { passive: true });

cartSidebar.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    touchDiff = e.touches[0].clientY - touchStartY;
    if (touchDiff > 0) {
        cartSidebar.style.transform = `translateY(${touchDiff}px)`;
    }
}, { passive: true });

cartSidebar.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    if (touchDiff > 100) {
        closeCartSidebar();
    }
    cartSidebar.style.transform = '';
    touchDiff = 0;
}, { passive: true });

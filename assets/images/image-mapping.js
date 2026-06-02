/** Auto-generated — 10 product image URLs */
const productImages = {
  "1":{"name":"ABC BATERAI JAM","url":"https://img.lazcdn.com/g/p/4723b0111d847691572af7df8befb316.jpg","status":"found"},
  "2":{"name":"ABC BATERAI REMOT","url":"https://img.lazcdn.com/g/p/857c903f9897e535c7e9f5d1dddc36bd.jpg","status":"found"},
  "3":{"name":"ABC BATERAI REMOT HITAM","url":"https://img.lazcdn.com/g/p/6a8884f2b2c5b4c2224e6b6950cfc27e.jpg","status":"found"},
  "4":{"name":"ABC BOTOL CHOCOMALT","url":"https://img.lazcdn.com/g/p/2429c1f27e1d35755b95bb6eec03c28d.jpg","status":"found"},
  "5":{"name":"ABC GULA AREN","url":"https://img.lazcdn.com/g/p/029ba3c3eb0724ebcb1ae638dd61d689.jpg","status":"found"},
  "6":{"name":"ABC KECAP 250G","url":"https://img.lazcdn.com/g/p/0945e57faea9083215d9c184f333dc7a.jpg","status":"found"},
  "7":{"name":"ABC KECAP 600G","url":"https://img.lazcdn.com/g/p/0fee286f89d26541b442bc6bcfaff148.png","status":"found"},
  "8":{"name":"ABC KECAP 62G B3G1","url":"https://img.lazcdn.com/g/p/d9af5f92573ba7c6c5381081306eba4c.jpg","status":"found"},
  "9":{"name":"ABC KECAP 685G","url":"https://img.lazcdn.com/g/p/c2af3a5284b6d0069b5c091362d25e2f.jpg","status":"found"},
  "10":{"name":"ABC KECAP ASIN BOTOL 131ML","url":"https://img.lazcdn.com/g/p/bc56d6d8c5061f6a2f2934371f5139a6.png","status":"found"},
};
function getProductImage(id){const e=productImages[id];return e&&e.url?e.url:null;}
function getImageStatus(id){const e=productImages[id];return e?e.status:"missing";}

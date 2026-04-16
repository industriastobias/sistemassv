// INVENTARIO.JS - Funciones del módulo de inventario
const CONFIG = { PASSWORD_EDIT: 'KLOHESV', BARCODE_CACHE_SIZE: 500, DEBOUNCE_DELAY: 150, PAGE_SIZE_DEFAULT: 5000 };
let inventory = [], filteredInventory = [], currentPage = 1;
let pageSize = parseInt(localStorage.getItem('pageSize')) || CONFIG.PAGE_SIZE_DEFAULT;
let currentView = localStorage.getItem('preferredView') || 'table';
let currentSaleIndex = -1, currentPriceIndex = -1, currentStockIndex = -1, currentEditPendingIndex = -1;
let whoPays = 'client', usbReaderActive = false, usbBuffer = '', html5QrCode = null;
let barcodeCache = new Map(), imageCache = new Map();
let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
let pendingDeleteIndex = -1, pendingPaymentIndex = -1, pendingDeliveryIndex = -1;
let currentPaymentMethod = 'cash', currentEditDeliveryIndex = -1;
let pendingDeliveryDeleteIndex = -1, pendingPaymentDeleteIndex = -1, currentCompletePaymentIndex = -1;

// Audio
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {}
}
function playSuccessSound() {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 600;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 800;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.15);
    }, 100);
  } catch (e) {}
}
function playScanSuccessSound() {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.15);
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 1500;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.15);
    }, 80);
  } catch (e) {}
}
function playScanErrorSound() {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.35);
  } catch (e) {}
}

// Utilidades
function debounce(fn, delay) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn(...args), delay); }; }
function showNotification(message, type = 'success') { 
  const container = document.getElementById('notificationContainer'); 
  const notif = document.createElement('div'); 
  notif.className = `notification ${type}`; 
  notif.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check' : type === 'error' ? 'xmark' : 'exclamation'}"></i> ${message}`; 
  container.appendChild(notif); 
  setTimeout(() => notif.remove(), 3000); 
}
function showLoading(show = true) { document.getElementById('loadingOverlay').classList.toggle('active', show); }
function formatCurrency(amount) { return '$' + (amount || 0).toFixed(2); }
function formatDate(dateStr) { if (!dateStr) return 'N/A'; try { return new Date(dateStr).toLocaleString('es-ES'); } catch { return 'N/A'; } }

function levenshteinDistance(a, b) { 
  const matrix = []; 
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]; 
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j; 
  for (let i = 1; i <= b.length; i++) 
    for (let j = 1; j <= a.length; j++) 
      matrix[i][j] = b[i-1] === a[j-1] ? matrix[i-1][j-1] : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1); 
  return matrix[b.length][a.length]; 
}
function fuzzyMatch(text, query) { 
  if (!text || !query) return false; 
  text = text.toLowerCase(); query = query.toLowerCase(); 
  if (text.includes(query)) return true; 
  const queryWords = query.split(/\s+/), textWords = text.split(/\s+/); 
  return queryWords.every(qw => textWords.some(tw => { 
    const dist = levenshteinDistance(qw, tw); 
    return dist <= Math.max(1, Math.floor(qw.length * 0.3)); 
  })); 
}

// Barcode e Imagen
function getCachedBarcode(barcode) { return barcode ? barcodeCache.get(barcode) || null : null; }
function setCachedBarcode(barcode, dataUrl) { 
  if (!barcode || !dataUrl) return; 
  if (barcodeCache.size >= CONFIG.BARCODE_CACHE_SIZE) barcodeCache.delete(barcodeCache.keys().next().value); 
  barcodeCache.set(barcode, dataUrl); 
}
function generateBarcodeDataUrl(barcode) { 
  if (!barcode) return ''; 
  const cached = getCachedBarcode(barcode); 
  if (cached) return cached; 
  try { 
    const canvas = document.createElement('canvas'); 
    JsBarcode(canvas, barcode, { format: 'CODE128', width: 2, height: 40, displayValue: false }); 
    const dataUrl = canvas.toDataURL('image/png'); 
    setCachedBarcode(barcode, dataUrl); 
    return dataUrl; 
  } catch (e) { return ''; } 
}
async function getProductImage(code) { 
  if (imageCache.has(code)) return imageCache.get(code); 
  try { 
    const blob = await localforage.getItem(`img_${code}`); 
    if (blob) { 
      const url = URL.createObjectURL(blob); 
      imageCache.set(code, url); 
      return url; 
    } 
  } catch (e) {} 
  return null; 
}

// Inventario
function loadInventory() { 
  try { 
    const stored = localStorage.getItem('inventory'); 
    inventory = stored ? JSON.parse(stored) : []; 
    inventory.forEach(item => { if (!item.date) item.date = new Date().toISOString(); }); 
    updateCategories(); 
    updateStats(); 
    filteredInventory = [...inventory];
    filteredInventory.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
    document.getElementById('filteredProducts').textContent = filteredInventory.length;
  } catch (e) { inventory = []; filteredInventory = []; } 
}
function saveInventory() { localStorage.setItem('inventory', JSON.stringify(inventory)); updateStats(); }
function updateCategories() { 
  const categories = [...new Set(inventory.map(i => i.category).filter(Boolean))].sort(); 
  const select = document.getElementById('categoryFilter'); 
  const current = select.value; 
  select.innerHTML = '<option value="">Todas las categorias</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join(''); 
  select.value = current; 
}
function updateStats() { 
  const total = inventory.length, 
        lowStock = inventory.filter(i => (i.quantity || 0) <= (i.stockMin || 0)).length, 
        totalValue = inventory.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 0)), 0); 
  document.getElementById('totalProducts').textContent = total; 
  document.getElementById('totalValue').textContent = formatCurrency(totalValue); 
  const lowBadge = document.getElementById('lowStockBadge'); 
  document.getElementById('lowStockCount').textContent = lowStock; 
  lowBadge.style.display = lowStock > 0 ? 'inline-flex' : 'none'; 
  
  const pendingCOD = JSON.parse(localStorage.getItem('pendingInventory') || '[]');
  const pendingDelivery = JSON.parse(localStorage.getItem('pendingDeliveryInventory') || '[]');
  const pendingPayment = JSON.parse(localStorage.getItem('pendingPaymentInventory') || '[]');
  const totalPending = pendingCOD.length + pendingDelivery.length + pendingPayment.length;
  
  document.getElementById('pendingCount').textContent = totalPending;
  document.getElementById('pendingBadge').style.display = totalPending > 0 ? 'inline-flex' : 'none';
  document.getElementById('pendingPaymentCount').textContent = pendingPayment.length;
  document.getElementById('pendingPaymentBadge').style.display = pendingPayment.length > 0 ? 'inline-flex' : 'none';
  updateDailySalesBadge();
  updateFixedTotal();
}
function updateDailySalesBadge() {
  const today = new Date().toISOString().split('T')[0];
  const sales = JSON.parse(localStorage.getItem('soldInventory') || '[]');
  const todaySales = sales.filter(s => s.date && new Date(s.date).toISOString().split('T')[0] === today);
  document.getElementById('dailySalesCount').textContent = todaySales.length;
  document.getElementById('dailySalesBadge').style.display = todaySales.length > 0 ? 'inline-flex' : 'none';
}

// Filtros
const debouncedFilter = debounce(() => { currentPage = 1; applyFilters(); }, CONFIG.DEBOUNCE_DELAY);
function applyFilters() { 
  const query = document.getElementById('searchInput').value.trim(), 
        category = document.getElementById('categoryFilter').value, 
        minPrice = parseFloat(document.getElementById('minPriceFilter').value) || 0, 
        maxPrice = parseFloat(document.getElementById('maxPriceFilter').value) || Infinity, 
        barcode = document.getElementById('barcodeFilter').value.trim().toLowerCase(), 
        searchDate = document.getElementById('dateFilter').value, 
        lowStockOnly = document.getElementById('lowStockFilter').checked; 
  if (query) addToSearchHistory(query); 
  filteredInventory = inventory.filter(item => { 
    const nameMatch = !query || fuzzyMatch(item.name, query), 
          catMatch = !category || item.category === category, 
          finalPrice = (item.price || 0) * (1 - (item.discount || 0) / 100), 
          priceMatch = finalPrice >= minPrice && finalPrice <= maxPrice, 
          barcodeMatch = !barcode || (item.barcode || '').toLowerCase().includes(barcode), 
          stockMatch = !lowStockOnly || (item.quantity || 0) <= (item.stockMin || 0); 
    let dateMatch = true; 
    if (searchDate && item.date) { 
      try { dateMatch = new Date(item.date).toISOString().split('T')[0] === searchDate; } 
      catch (e) { dateMatch = false; } 
    } 
    return nameMatch && catMatch && priceMatch && barcodeMatch && stockMatch && dateMatch; 
  }); 
  filteredInventory.sort((a, b) => (b.quantity || 0) - (a.quantity || 0)); 
  document.getElementById('filteredProducts').textContent = filteredInventory.length; 
  renderInventory(); 
}
function clearAllFilters() { 
  ['searchInput', 'categoryFilter', 'minPriceFilter', 'maxPriceFilter', 'barcodeFilter', 'dateFilter'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lowStockFilter').checked = false; 
  document.getElementById('goToRow').value = ''; 
  currentPage = 1; 
  filteredInventory = [...inventory].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
  document.getElementById('filteredProducts').textContent = filteredInventory.length;
  renderInventory(); 
}

// Historial de busqueda
function addToSearchHistory(query) { 
  if (!query || query.length < 2) return; 
  searchHistory = searchHistory.filter(h => h !== query); 
  searchHistory.unshift(query); 
  if (searchHistory.length > 8) searchHistory.pop(); 
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory)); 
  renderSearchHistory(); 
}
function clearSearchHistory() { searchHistory = []; localStorage.removeItem('searchHistory'); renderSearchHistory(); showNotification('Historial eliminado', 'success'); }
function renderSearchHistory() { 
  const container = document.getElementById('searchHistory'); 
  if (!searchHistory.length) { container.innerHTML = ''; return; } 
  container.innerHTML = '<span style="color:var(--text-secondary);font-size:0.75rem;">Historial:</span> ' + 
    searchHistory.map(h => `<span class="history-chip" onclick="document.getElementById('searchInput').value='${h}';applyFilters();"><i class="fa-solid fa-clock-rotate-left"></i> ${h}</span>`).join('') + 
    ' <button class="clear-history-btn" onclick="clearSearchHistory()">Limpiar</button>'; 
}

// Vistas
function setView(view) { 
  currentView = view; 
  localStorage.setItem('preferredView', view); 
  document.getElementById('btnTableView').classList.toggle('active', view === 'table'); 
  document.getElementById('btnCardsView').classList.toggle('active', view === 'cards'); 
  document.getElementById('tableView').style.display = view === 'table' ? 'block' : 'none'; 
  document.getElementById('cardsView').style.display = view === 'cards' ? 'grid' : 'none'; 
  renderInventory(); 
}
async function renderInventory() { 
  const start = (currentPage - 1) * pageSize, 
        end = start + pageSize, 
        pageItems = filteredInventory.slice(start, end), 
        totalPages = Math.ceil(filteredInventory.length / pageSize); 
  if (currentView === 'table') await renderTable(pageItems, start); 
  else await renderCards(pageItems, start); 
  renderPagination(totalPages); 
  document.getElementById('emptyState').style.display = pageItems.length ? 'none' : 'block'; 
}
async function renderTable(items, startIdx) { 
  const tbody = document.getElementById('inventoryTable'), barcodes = {}, images = {}; 
  items.forEach(item => { if (item.barcode) barcodes[item.barcode] = generateBarcodeDataUrl(item.barcode); }); 
  await Promise.all(items.map(async item => { images[item.code] = await getProductImage(item.code); })); 
  const searchQuery = document.getElementById('searchInput').value;
  tbody.innerHTML = items.map((item, idx) => { 
    const realIdx = inventory.indexOf(item), 
          displayIdx = startIdx + idx + 1, 
          finalPrice = (item.price || 0) * (1 - (item.discount || 0) / 100), 
          isLowStock = (item.quantity || 0) <= (item.stockMin || 0), 
          imgUrl = images[item.code], 
          barcodeUrl = barcodes[item.barcode]; 
    let nameHtml = item.name;
    if (searchQuery) {
      const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      nameHtml = item.name.replace(regex, '<mark>$1</mark>');
    }
    return `<tr id="row-${displayIdx}" data-index="${realIdx}">
      <td>${displayIdx}</td>
      <td>${imgUrl ? `<img src="${imgUrl}" class="cell-img" onclick="openImage('${imgUrl}')" alt="">` : '<div style="width:48px;height:48px;background:var(--border-light);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.625rem;">Sin img</div>'}</td>
      <td>${nameHtml}</td>
      <td>${barcodeUrl ? `<img src="${barcodeUrl}" class="cell-barcode" onclick="openBarcodeModal('${barcodeUrl}', '${item.barcode}')" alt="">` : '<span style="color:var(--text-secondary);">N/A</span>'}</td>
      <td class="cell-price">${formatCurrency(item.price)}</td>
      <td>${item.discount || 0}%</td>
      <td><strong>${formatCurrency(finalPrice)}</strong></td>
      <td>${formatDate(item.date)}</td>
      <td class="cell-stock ${isLowStock ? 'low' : ''}">${item.quantity || 0}</td>
      <td>${item.category || 'N/A'}</td>
      <td><div class="cell-actions">
        <button class="btn btn-sm btn-success" onclick="openSaleModal(${realIdx})"><i class="fa-solid fa-cart-plus"></i></button>
        <button class="btn btn-sm" onclick="requestPassword('price', ${realIdx})"><i class="fa-solid fa-tag"></i></button>
        <button class="btn btn-sm" onclick="requestPassword('stock', ${realIdx})"><i class="fa-solid fa-box"></i></button>
        <button class="btn btn-sm" onclick="openDescriptionModal(${realIdx})"><i class="fa-solid fa-eye"></i></button>
      </div></td>
    </tr>`; 
  }).join(''); 
}
async function renderCards(items, startIdx) { 
  const container = document.getElementById('cardsView'), barcodes = {}, images = {}; 
  await Promise.all(items.map(async item => { 
    if (item.barcode) barcodes[item.barcode] = generateBarcodeDataUrl(item.barcode); 
    images[item.code] = await getProductImage(item.code); 
  })); 
  const searchQuery = document.getElementById('searchInput').value;
  container.innerHTML = items.map((item, idx) => { 
    const realIdx = inventory.indexOf(item), 
          finalPrice = (item.price || 0) * (1 - (item.discount || 0) / 100), 
          isLowStock = (item.quantity || 0) <= (item.stockMin || 0), 
          imgUrl = images[item.code], 
          barcodeUrl = barcodes[item.barcode]; 
    let nameHtml = item.name;
    if (searchQuery) {
      const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      nameHtml = item.name.replace(regex, '<mark>$1</mark>');
    }
    return `<div class="product-card" id="card-${startIdx + idx + 1}" data-index="${realIdx}">
      ${imgUrl ? `<img src="${imgUrl}" class="card-image" onclick="openImage('${imgUrl}')" alt="">` : '<div style="width:100%;height:180px;background:var(--border-light);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">Sin imagen</div>'}
      <div class="card-content">
        <div class="card-title">${nameHtml}</div>
        <div class="card-meta">
          <span><i class="fa-solid fa-barcode"></i> ${item.barcode || 'N/A'}</span>
          <span><i class="fa-solid fa-layer-group"></i> ${item.category || 'N/A'}</span>
          <span><i class="fa-solid fa-calendar"></i> ${formatDate(item.date)}</span>
          <span class="${isLowStock ? 'cell-stock low' : ''}"><i class="fa-solid fa-box"></i> Stock: ${item.quantity || 0}</span>
        </div>
        ${barcodeUrl ? `<img src="${barcodeUrl}" class="card-barcode" onclick="openBarcodeModal('${barcodeUrl}', '${item.barcode}')" alt="">` : ''}
        <div class="card-footer">
          <span class="card-price">${formatCurrency(finalPrice)}</span>
          <div class="cell-actions">
            <button class="btn btn-sm btn-success" onclick="openSaleModal(${realIdx})"><i class="fa-solid fa-cart-plus"></i></button>
            <button class="btn btn-sm" onclick="requestPassword('price', ${realIdx})"><i class="fa-solid fa-tag"></i></button>
            <button class="btn btn-sm" onclick="requestPassword('stock', ${realIdx})"><i class="fa-solid fa-box"></i></button>
          </div>
        </div>
      </div>
    </div>`; 
  }).join(''); 
}
function renderPagination(totalPages) { 
  const container = document.getElementById('pagination'); 
  if (totalPages <= 1) { container.innerHTML = ''; return; } 
  container.innerHTML = `<button class="pagination-btn" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button><span class="pagination-info">Pagina ${currentPage} de ${totalPages}</span><button class="pagination-btn" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`; 
}
function changePage(direction) { 
  const totalPages = Math.ceil(filteredInventory.length / pageSize), newPage = currentPage + direction; 
  if (newPage >= 1 && newPage <= totalPages) { 
    currentPage = newPage; 
    renderInventory(); 
    document.querySelector('.table-container')?.scrollIntoView({ behavior: 'smooth' }); 
  } 
}
function changePageSize() { 
  pageSize = parseInt(document.getElementById('pageSize').value); 
  localStorage.setItem('pageSize', pageSize); 
  currentPage = 1; 
  renderInventory(); 
}
function goToRow() { 
  const row = parseInt(document.getElementById('goToRow').value); 
  if (!row || row < 1) { showNotification('Numero de fila invalido', 'warning'); return; } 
  const targetPage = Math.ceil(row / pageSize); 
  if (targetPage !== currentPage) { currentPage = targetPage; renderInventory(); } 
  setTimeout(() => { 
    const target = document.getElementById(`row-${row}`) || document.getElementById(`card-${row}`); 
    if (target) { 
      document.querySelectorAll('#inventoryTable tr, .product-card').forEach(el => el.classList.remove('highlight')); 
      target.classList.add('highlight'); 
      target.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
    } else { showNotification('Fila fuera de rango', 'warning'); } 
  }, 100); 
}

// Imagen y Barcode
function openImage(src) { document.getElementById('overlayImage').src = src; document.getElementById('imageOverlay').classList.add('active'); }
function closeImageOverlay() { document.getElementById('imageOverlay').classList.remove('active'); }
function openBarcodeModal(url, barcode) { 
  document.getElementById('barcodeLargeImg').src = url; 
  document.getElementById('barcodeLargeText').textContent = barcode; 
  document.getElementById('barcodeLargeOverlay').classList.add('active'); 
}
function closeBarcodeLarge() { document.getElementById('barcodeLargeOverlay').classList.remove('active'); }
let currentBarcodeUrl = '';
function openBarcodeLargeFromModal() { if (currentBarcodeUrl) openBarcodeModal(currentBarcodeUrl, document.getElementById('saleBarcodeText').textContent); }
function openBarcodeLargeFromEditModal() { 
  const src = document.getElementById('editPendingBarcode').src; 
  const barcode = document.getElementById('editPendingBarcodeText').textContent; 
  if (src) openBarcodeModal(src, barcode); 
}

// Password
function requestPassword(action, index) {
  document.getElementById('passwordAction').value = action;
  document.getElementById('passwordIndex').value = index;
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordModal').classList.add('active');
  setTimeout(() => document.getElementById('passwordInput').focus(), 100);
}
function closePasswordModal() { document.getElementById('passwordModal').classList.remove('active'); }
function verifyPassword() {
  if (document.getElementById('passwordInput').value !== CONFIG.PASSWORD_EDIT) {
    showNotification('Contraseña incorrecta', 'error');
    document.getElementById('passwordInput').value = '';
    return;
  }
  closePasswordModal();
  const action = document.getElementById('passwordAction').value;
  const index = parseInt(document.getElementById('passwordIndex').value);
  if (action === 'price') openPriceModal(index);
  else if (action === 'stock') openStockModal(index);
}

// Venta Modal
async function openSaleModal(index) { 
  playBeep();
  currentSaleIndex = index; 
  currentPaymentMethod = 'cash';
  const item = inventory[index], finalPrice = (item.price || 0) * (1 - (item.discount || 0) / 100); 
  document.getElementById('salePrice').value = finalPrice.toFixed(2); 
  document.getElementById('saleQuantity').value = 1; 
  document.getElementById('saleDisplayPrice').textContent = formatCurrency(finalPrice); 
  document.getElementById('saleDisplayStock').textContent = item.quantity || 0; 
  const imgUrl = await getProductImage(item.code); 
  document.getElementById('saleProductImage').src = imgUrl || ''; 
  if (item.barcode) { 
    currentBarcodeUrl = generateBarcodeDataUrl(item.barcode); 
    document.getElementById('saleBarcodeImage').src = currentBarcodeUrl; 
    document.getElementById('saleBarcodeText').textContent = item.barcode; 
  } else { 
    document.getElementById('saleBarcodeImage').src = ''; 
    document.getElementById('saleBarcodeText').textContent = 'N/A'; 
  } 
  ['isCOD', 'isPendingDelivery', 'isPendingPayment'].forEach(id => document.getElementById(id).checked = false);
  ['codConfig', 'pendingDeliveryConfig', 'pendingDeliveryToggle', 'pendingPaymentConfig', 'pendingPaymentToggle'].forEach(id => document.getElementById(id).classList.remove('active'));
  selectPaymentMethod('cash');
  ['codShipping', 'codCommission', 'codInsurance', 'pendingDeliveryShipping', 'pendingDeliveryCommission', 'pendingPaymentClientName', 'pendingPaymentAmount'].forEach(id => document.getElementById(id).value = '');
  selectWhoPays('client'); 
  updateSaleCalculations(); 
  document.getElementById('saleModal').classList.add('active'); 
}
function closeSaleModal() { document.getElementById('saleModal').classList.remove('active'); }
function selectPaymentMethod(method) {
  currentPaymentMethod = method;
  document.getElementById('btnPaymentCash').classList.toggle('active', method === 'cash');
  document.getElementById('btnPaymentTransfer').classList.toggle('active', method === 'transfer');
}
function togglePendingDelivery() {
  const isPending = document.getElementById('isPendingDelivery').checked;
  document.getElementById('pendingDeliveryConfig').classList.toggle('active', isPending);
  document.getElementById('pendingDeliveryToggle').classList.toggle('active', isPending);
  if (isPending) {
    ['isCOD', 'isPendingPayment'].forEach(id => document.getElementById(id).checked = false);
    ['codConfig', 'pendingPaymentConfig', 'pendingPaymentToggle'].forEach(id => document.getElementById(id).classList.remove('active'));
  }
  updateSaleCalculations();
}
function togglePendingPayment() {
  const isPending = document.getElementById('isPendingPayment').checked;
  document.getElementById('pendingPaymentConfig').classList.toggle('active', isPending);
  document.getElementById('pendingPaymentToggle').classList.toggle('active', isPending);
  if (isPending) {
    ['isCOD', 'isPendingDelivery'].forEach(id => document.getElementById(id).checked = false);
    ['codConfig', 'pendingDeliveryConfig', 'pendingDeliveryToggle'].forEach(id => document.getElementById(id).classList.remove('active'));
  }
  updateSaleCalculations();
}
function toggleCOD() { 
  const isCOD = document.getElementById('isCOD').checked; 
  document.getElementById('codConfig').classList.toggle('active', isCOD); 
  if (isCOD) {
    ['isPendingDelivery', 'isPendingPayment'].forEach(id => document.getElementById(id).checked = false);
    ['pendingDeliveryConfig', 'pendingDeliveryToggle', 'pendingPaymentConfig', 'pendingPaymentToggle'].forEach(id => document.getElementById(id).classList.remove('active'));
  }
  if (isCOD) updateSaleCalculations(); 
}
function selectWhoPays(who) { 
  whoPays = who; 
  document.getElementById('labelClientPays').classList.toggle('selected', who === 'client'); 
  document.getElementById('labelWePays').classList.toggle('selected', who === 'we'); 
  updateSaleCalculations(); 
}
function updateSaleCalculations() { 
  const item = inventory[currentSaleIndex]; 
  if (!item) return; 
  const qty = parseInt(document.getElementById('saleQuantity').value) || 1, 
        price = parseFloat(document.getElementById('salePrice').value) || 0, 
        isCOD = document.getElementById('isCOD').checked,
        isPendingDelivery = document.getElementById('isPendingDelivery').checked,
        isPendingPayment = document.getElementById('isPendingPayment').checked,
        subtotal = price * qty; 
  
  if (isCOD) { 
    const shipping = parseFloat(document.getElementById('codShipping').value) || 0, 
          commissionType = document.getElementById('codCommissionType').value, 
          commissionValue = parseFloat(document.getElementById('codCommission').value) || 0, 
          insurance = parseFloat(document.getElementById('codInsurance').value) || 0; 
    document.getElementById('commissionLabel').textContent = commissionType === 'percentage' ? 'Comision (%)' : 'Comision ($)'; 
    let commission = commissionType === 'percentage' ? (subtotal * commissionValue) / 100 : commissionValue;
    const total = whoPays === 'client' ? subtotal + shipping + commission + insurance : (subtotal - commission) + shipping + insurance;
    const net = whoPays === 'client' ? subtotal : (subtotal - commission); 
    document.getElementById('calcSubtotal').textContent = formatCurrency(subtotal); 
    document.getElementById('calcShipping').textContent = formatCurrency(shipping); 
    document.getElementById('calcCommission').textContent = formatCurrency(commission); 
    document.getElementById('calcTotal').textContent = formatCurrency(total); 
    document.getElementById('calcNet').textContent = formatCurrency(net); 
  } else { 
    document.getElementById('calcSubtotal').textContent = formatCurrency(subtotal); 
    document.getElementById('calcShipping').textContent = '$0.00'; 
    document.getElementById('calcCommission').textContent = '$0.00'; 
    document.getElementById('calcTotal').textContent = formatCurrency(subtotal); 
    document.getElementById('calcNet').textContent = formatCurrency(subtotal); 
  }
  if (isPendingDelivery) {
    const shipping = parseFloat(document.getElementById('pendingDeliveryShipping').value) || 0;
    const commissionPercent = parseFloat(document.getElementById('pendingDeliveryCommission').value) || 0;
    const commission = (subtotal * commissionPercent) / 100;
    const total = subtotal + shipping + commission;
    document.getElementById('calcPendingSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('calcPendingShipping').textContent = formatCurrency(shipping);
    document.getElementById('calcPendingCommission').textContent = formatCurrency(commission);
    document.getElementById('calcPendingTotal').textContent = formatCurrency(total);
  }
  if (isPendingPayment) {
    const paidAmount = parseFloat(document.getElementById('pendingPaymentAmount').value) || 0;
    const pending = subtotal - paidAmount;
    document.getElementById('calcPaymentOriginal').textContent = formatCurrency(subtotal);
    document.getElementById('calcPaymentPaid').textContent = formatCurrency(paidAmount);
    document.getElementById('calcPaymentPending').textContent = formatCurrency(pending > 0 ? pending : 0);
  }
}
function processSale() { 
  playSuccessSound();
  const item = inventory[currentSaleIndex], 
        qty = parseInt(document.getElementById('saleQuantity').value) || 1, 
        price = parseFloat(document.getElementById('salePrice').value) || 0, 
        isCOD = document.getElementById('isCOD').checked,
        isPendingDelivery = document.getElementById('isPendingDelivery').checked,
        isPendingPayment = document.getElementById('isPendingPayment').checked; 
  if (qty > item.quantity) { showNotification('Stock insuficiente', 'error'); return; } 
  item.quantity -= qty; 
  saveInventory(); 
  const subtotal = price * qty;
  
  if (isCOD) { 
    const shipping = parseFloat(document.getElementById('codShipping').value) || 0, 
          commissionType = document.getElementById('codCommissionType').value, 
          commissionValue = parseFloat(document.getElementById('codCommission').value) || 0, 
          insurance = parseFloat(document.getElementById('codInsurance').value) || 0; 
    let commission = commissionType === 'percentage' ? (subtotal * commissionValue) / 100 : commissionValue;
    const totalToCollect = whoPays === 'client' ? subtotal + shipping + commission + insurance : (subtotal - commission) + shipping + insurance;
    if (totalToCollect < 0) { showNotification('Error: La comision no puede ser mayor que el precio', 'error'); return; }
    const netEarnings = whoPays === 'client' ? subtotal : (subtotal - commission);
    const pending = JSON.parse(localStorage.getItem('pendingInventory') || '[]'); 
    pending.push({ 
      name: item.name, code: item.code, barcode: item.barcode, price: price, quantity: qty, total: subtotal,
      date: new Date().toISOString(), seller: 'Sistema', isCOD: true, 
      codShipping: shipping, codCommissionType: commissionType, codCommission: commissionValue, 
      codCommissionAmount: commission, codInsurance: insurance, whoPaysCommission: whoPays, 
      totalToCollect: totalToCollect, netEarnings: netEarnings, paymentMethod: currentPaymentMethod
    }); 
    localStorage.setItem('pendingInventory', JSON.stringify(pending)); 
    showNotification('Pedido COD guardado. Total a cobrar: ' + formatCurrency(totalToCollect), 'success'); 
  } else if (isPendingDelivery) {
    const shipping = parseFloat(document.getElementById('pendingDeliveryShipping').value) || 0;
    const commissionPercent = parseFloat(document.getElementById('pendingDeliveryCommission').value) || 0;
    const commission = (subtotal * commissionPercent) / 100;
    const total = subtotal + shipping + commission;
    const pendingDelivery = JSON.parse(localStorage.getItem('pendingDeliveryInventory') || '[]');
    pendingDelivery.push({
      name: item.name, code: item.code, barcode: item.barcode, price: price, quantity: qty, total: subtotal,
      date: new Date().toISOString(), seller: 'Sistema', isPendingDelivery: true,
      deliveryShipping: shipping, deliveryCommissionPercent: commissionPercent, deliveryCommissionAmount: commission,
      totalToCollect: total, paymentMethod: currentPaymentMethod, deliveryStatus: 'pending'
    });
    localStorage.setItem('pendingDeliveryInventory', JSON.stringify(pendingDelivery));
    showNotification('Venta pendiente de entrega registrada. Total: ' + formatCurrency(total), 'success');
  } else if (isPendingPayment) {
    const clientName = document.getElementById('pendingPaymentClientName').value.trim();
    const paidAmount = parseFloat(document.getElementById('pendingPaymentAmount').value) || 0;
    if (!clientName) { showNotification('Debe ingresar el nombre del cliente', 'error'); return; }
    if (paidAmount >= subtotal) { showNotification('El monto abonado no puede ser igual o mayor al total', 'error'); return; }
    const pendingPayment = JSON.parse(localStorage.getItem('pendingPaymentInventory') || '[]');
    pendingPayment.push({
      name: item.name, code: item.code, barcode: item.barcode, price: price, originalPrice: item.price,
      quantity: qty, total: subtotal, date: new Date().toISOString(), seller: 'Sistema', isPendingPayment: true,
      clientName: clientName, paidAmount: paidAmount, pendingAmount: subtotal - paidAmount,
      paymentMethod: currentPaymentMethod, paymentStatus: 'partial'
    });
    localStorage.setItem('pendingPaymentInventory', JSON.stringify(pendingPayment));
    showNotification(`Venta pendiente de cobro registrada. Cliente: ${clientName}. Abonado: ${formatCurrency(paidAmount)}. Debe: ${formatCurrency(subtotal - paidAmount)}`, 'success');
  } else { 
    const sales = JSON.parse(localStorage.getItem('soldInventory') || '[]'); 
    sales.push({ 
      name: item.name, code: item.code, barcode: item.barcode, price: price, quantity: qty, 
      total: subtotal, date: new Date().toISOString(), seller: 'Sistema',
      paymentMethod: currentPaymentMethod, saleType: 'immediate'
    }); 
    localStorage.setItem('soldInventory', JSON.stringify(sales)); 
    showNotification(`Venta registrada (${currentPaymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'})`, 'success'); 
  } 
  closeSaleModal(); 
  applyFilters(); 
  updateStats(); 
}

// Price y Stock Modals
function openPriceModal(index) { 
  currentPriceIndex = index; 
  const item = inventory[index]; 
  document.getElementById('priceProductName').value = item.name; 
  document.getElementById('priceCurrent').value = formatCurrency(item.price); 
  document.getElementById('priceNew').value = item.price; 
  document.getElementById('priceModal').classList.add('active'); 
}
function closePriceModal() { document.getElementById('priceModal').classList.remove('active'); }
function savePrice() { 
  const newPrice = parseFloat(document.getElementById('priceNew').value); 
  if (isNaN(newPrice) || newPrice < 0) { showNotification('Precio invalido', 'error'); return; } 
  inventory[currentPriceIndex].price = newPrice; 
  saveInventory(); 
  applyFilters(); 
  closePriceModal(); 
  showNotification('Precio actualizado', 'success'); 
}
function openStockModal(index) { 
  currentStockIndex = index; 
  const item = inventory[index]; 
  document.getElementById('stockProductName').value = item.name; 
  document.getElementById('stockCurrent').value = item.quantity || 0; 
  document.getElementById('stockNew').value = item.quantity || 0; 
  document.getElementById('stockModal').classList.add('active'); 
}
function closeStockModal() { document.getElementById('stockModal').classList.remove('active'); }
function saveStock() { 
  const newStock = parseInt(document.getElementById('stockNew').value); 
  if (isNaN(newStock) || newStock < 0) { showNotification('Stock invalido', 'error'); return; } 
  inventory[currentStockIndex].quantity = newStock; 
  saveInventory(); 
  applyFilters(); 
  closeStockModal(); 
  showNotification('Stock actualizado', 'success'); 
}
function openDescriptionModal(index) { 
  const item = inventory[index]; 
  document.getElementById('descriptionContent').textContent = item.description || 'Sin descripcion disponible.'; 
  document.getElementById('descriptionModal').classList.add('active'); 
}
function closeDescriptionModal() { document.getElementById('descriptionModal').classList.remove('active'); }

// Pendientes Panel
function togglePendingPanel() { 
  const panel = document.getElementById('pendingPanel');
  const mainPanel = document.getElementById('mainInventoryPanel');
  const controls = document.getElementById('viewControls');
  const stats = document.querySelector('.stats-bar');
  const gotoRow = document.querySelector('.goto-row');
  const searchPanel = document.querySelector('.search-panel');
  const otherPanels = ['dailyReportPanel', 'salesHistoryPanel', 'dailySalesPanel'];
  
  if (panel.classList.contains('active')) { 
    panel.classList.remove('active'); 
    mainPanel.style.display = 'block';
    controls.style.display = 'flex'; 
    stats.style.display = 'flex';
    gotoRow.style.display = 'flex'; 
    searchPanel.style.display = 'block';
  } else { 
    otherPanels.forEach(id => document.getElementById(id).classList.remove('active'));
    panel.classList.add('active'); 
    mainPanel.style.display = 'none';
    controls.style.display = 'none'; 
    stats.style.display = 'none';
    gotoRow.style.display = 'none'; 
    searchPanel.style.display = 'none';
    loadPendingList(); 
  }
}
function switchPendingTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  const tabIndex = tab === 'cod' ? 0 : tab === 'delivery' ? 1 : 2;
  document.querySelectorAll('.tab-btn')[tabIndex].classList.add('active');
  document.getElementById(tab === 'cod' ? 'codTab' : tab === 'delivery' ? 'deliveryTab' : 'paymentTab').classList.add('active');
  loadPendingList();
}

// Continuara en la siguiente parte...

// ⚠️ SECURITY DISCLAIMER: Base64/Checksums protect against casual URI modifications.

// ==================== CONFIGURATION ====================
const USE_HMAC = false;
const WORKER_SIGN_URL = 'https://invoice-gen-qr-system.shariful7972-b66.workers.dev/sign';

// ==================== MAIN INITIALIZATION (Runs after DOM is ready) ====================
document.addEventListener('DOMContentLoaded', () => {
  
  // 🔍 DOM Elements - NOW guaranteed to exist
  const form = document.getElementById('invoice-form');
  const itemsContainer = document.getElementById('form-items-container');
  const addItemBtn = document.getElementById('add-item-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const qrContainer = document.getElementById('qr-container');
  const invoiceItemsTbody = document.getElementById('invoice-items-tbody');
  
  // Debug: Log if any element is missing
  const missing = [];
  if (!form) missing.push('invoice-form');
  if (!itemsContainer) missing.push('form-items-container');
  if (!addItemBtn) missing.push('add-item-btn');
  if (!themeToggle) missing.push('theme-toggle');
  if (!qrContainer) missing.push('qr-container');
  if (!invoiceItemsTbody) missing.push('invoice-items-tbody');
  
  if (missing.length > 0) {
    console.error('❌ Missing HTML elements:', missing);
    console.log('💡 Check that index.html has these exact IDs');
    return; // Stop execution if critical elements missing
  }
  console.log('✅ All DOM elements found');

  // ==================== THEME HANDLING ====================
  function detectSystemTheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Apply theme on load
  const savedTheme = localStorage.getItem('invoice-theme');
  const initialTheme = savedTheme || detectSystemTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  console.log('🎨 Theme applied:', initialTheme);

  // Listen for system theme changes
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const newTheme = e.matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('invoice-theme', newTheme);
  });

  // Theme toggle button
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('invoice-theme', next);
    console.log('🌓 Theme toggled to:', next);
  });

  // Set invoice date
  document.getElementById('inv-date').textContent = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // ==================== UTILITIES ====================
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function generateChecksum(str) {
    return str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 9999;
  }

  function toUrlSafeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function generateFallbackPayload(obj) {
    const json = JSON.stringify(obj);
    const checksum = generateChecksum(json);
    const b64 = toUrlSafeBase64(json);
    return `${b64}.${checksum}.fallback`;
  }

  // ==================== DYNAMIC ITEM ROWS ====================
  function createItemRow(name = '', idVal = '', qty = 1, price = '') {
    console.log('📦 Creating item row:', {name, qty, price});
    
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
      <input type="text" placeholder="Item name" class="row-name" value="${escapeHtml(name)}" required aria-label="Item name">
      <input type="text" placeholder="Serial/IMEI (Optional)" class="row-serial" value="${escapeHtml(idVal)}" aria-label="Serial or IMEI">
      <input type="number" placeholder="Qty" class="row-qty" value="${qty}" min="1" required aria-label="Quantity">
      <input type="number" placeholder="Unit Price" class="row-price" step="0.01" min="0.01" value="${price}" required aria-label="Unit price">
      <button type="button" class="btn-danger" aria-label="Remove item">✕</button>
    `;
    
    // Attach remove button handler
    const removeBtn = div.querySelector('.btn-danger');
    removeBtn.addEventListener('click', () => {
      div.remove();
      console.log('🗑️ Item removed');
    });
    
    itemsContainer.appendChild(div);
    console.log('✅ Item row added');
    return div;
  }

  // Initialize: Add Item button + default row
  addItemBtn.addEventListener('click', () => {
    console.log('➕ Add Item button clicked');
    createItemRow();
  });
  
  // Add default item if container is empty
  if (itemsContainer.children.length === 0) {
    console.log('📱 Adding default Samsung Galaxy item');
    createItemRow('Samsung Galaxy S24 Ultra', 'IMEI: 358765432109876', 1, '1099.00');
  }

  // ==================== INVOICE RENDERING ====================
  async function renderInvoice(e) {
    if (e) e.preventDefault();
    console.log('🔄 Rendering invoice...');

    // Gather form values
    const id = document.getElementById('input-id')?.value.trim() || '';
    const buyer = document.getElementById('input-buyer')?.value.trim() || '';
    const phone = document.getElementById('input-phone')?.value.trim() || '';
    const email = document.getElementById('input-email')?.value.trim() || '';
    const taxRate = parseFloat(document.getElementById('input-tax')?.value) || 0;

    // Process items
    const itemRows = document.querySelectorAll('.item-row');
    console.log(`📋 Processing ${itemRows.length} item rows`);
    
    const items = [];
    let subtotal = 0;
    let valid = true;

    invoiceItemsTbody.innerHTML = '';

    itemRows.forEach((row, index) => {
      const name = row.querySelector('.row-name')?.value.trim() || '';
      const serial = row.querySelector('.row-serial')?.value.trim() || '';
      const qty = parseInt(row.querySelector('.row-qty')?.value) || 1;
      const unitPrice = parseFloat(row.querySelector('.row-price')?.value) || 0;

      if (unitPrice <= 0) {
        row.querySelector('.row-price')?.setCustomValidity('Price must be > 0');
        row.querySelector('.row-price')?.reportValidity();
        valid = false;
        return;
      }
      row.querySelector('.row-price')?.setCustomValidity('');

      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;
      items.push({ name, serial, qty, unitPrice: `$${unitPrice.toFixed(2)}`, price: `$${lineTotal.toFixed(2)}` });

      // Render table row safely
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(name)}</strong>${serial ? `<br><small style="color:#64748b">${escapeHtml(serial)}</small>` : ''}</td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right">$${unitPrice.toFixed(2)}</td>
        <td class="text-right"><strong>$${lineTotal.toFixed(2)}</strong></td>
      `;
      invoiceItemsTbody.appendChild(tr);
    });

    if (!valid) {
      console.warn('⚠️ Form validation failed');
      return;
    }
    if (items.length === 0) {
      alert('Please add at least one item.');
      return;
    }

    // Calculate totals
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Update invoice display
    document.getElementById('inv-id').textContent = id;
    document.getElementById('inv-buyer').textContent = buyer;
    document.getElementById('inv-phone').textContent = phone;
    document.getElementById('inv-email').textContent = email;
    document.getElementById('inv-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('inv-tax-amount').textContent = `$${taxAmount.toFixed(2)}`;
    document.getElementById('inv-total').textContent = `$${total.toFixed(2)}`;

    // Build payload
    const payload = { 
      id, buyer, total: `$${total.toFixed(2)}`, items, 
      status: 'verified', timestamp: Date.now() 
    };

    // Generate secured payload
    const securedPayload = generateFallbackPayload(payload);

    // Build verification URL
    const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const verifyURL = `${baseUrl}verify.html?payload=${encodeURIComponent(securedPayload)}`;
    console.log('🔗 Verify URL:', verifyURL);

    // Generate QR Code using qrcodejs API
    qrContainer.innerHTML = '';

    try {
      if (typeof QRCode === 'undefined') {
        throw new Error('QRCode library not loaded');
      }
      
      new QRCode(qrContainer, {
        text: verifyURL,
        width: 160,
        height: 160,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
      
      console.log('✅ QR generated successfully');
    } catch (err) {
      console.error('❌ QR Generation Error:', err);
      qrContainer.innerHTML = `<div style="color:#ef4444;padding:1rem;text-align:center">
        <strong>❌ QR Error</strong><br>
        <small>${err.message}</small><br>
        <button onclick="location.reload()" class="btn-secondary" style="margin-top:0.5rem">🔄 Reload Page</button>
      </div>`;
    }
  }

  // ==================== CLIPBOARD COPY ====================
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      alert('✅ Copied to clipboard!');
    } catch {
      alert('⚠️ Copy failed. Select text manually.');
    }
    document.body.removeChild(ta);
  }

  window.copyInvoiceData = function() {
    const data = JSON.stringify({
      invoiceId: document.getElementById('input-id')?.value,
      buyer: document.getElementById('input-buyer')?.value,
      grandTotal: document.getElementById('inv-total')?.textContent,
      generatedAt: new Date().toISOString()
    }, null, 2);
    
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(data)
        .then(() => alert('✅ Copied!'))
        .catch(() => fallbackCopy(data));
    } else {
      fallbackCopy(data);
    }
  };

  // ==================== EVENT LISTENERS ====================
  form.addEventListener('submit', renderInvoice);

  // Initial render
  console.log('🚀 Running initial render');
  renderInvoice();
  
}); // ✅ END OF DOMContentLoaded WRAPPER

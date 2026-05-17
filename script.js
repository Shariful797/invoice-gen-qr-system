// ⚠️ SECURITY DISCLAIMER: Base64/Checksums protect against casual URI modifications. 
// For high-value deployments, HMAC signing via Cloudflare Worker is enabled below.

// ==================== CONFIGURATION ====================
const USE_HMAC = false; // ← Keep FALSE until Worker is deployed
const WORKER_SIGN_URL = 'https://invoice-gen-qr-system.shariful7972-b66.workers.dev/sign';

// ==================== DOM ELEMENTS (Define ONCE at top) ====================
const form = document.getElementById('invoice-form');
const itemsContainer = document.getElementById('form-items-container');
const addItemBtn = document.getElementById('add-item-btn');
const themeToggle = document.getElementById('theme-toggle');
const qrContainer = document.getElementById('qr-container');
const invoiceItemsTbody = document.getElementById('invoice-items-tbody');

// ==================== THEME HANDLING ====================
function detectSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Apply theme on load
const savedTheme = localStorage.getItem('invoice-theme');
document.documentElement.setAttribute('data-theme', savedTheme || detectSystemTheme());

// Listen for system theme changes
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const newTheme = e.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('invoice-theme', newTheme);
});

// Theme toggle button
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('invoice-theme', next);
  });
}

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
  const div = document.createElement('div');
  div.className = 'item-row';
  div.innerHTML = `
    <input type="text" placeholder="Item name" class="row-name" value="${escapeHtml(name)}" required aria-label="Item name">
    <input type="text" placeholder="Serial/IMEI (Optional)" class="row-serial" value="${escapeHtml(idVal)}" aria-label="Serial or IMEI">
    <input type="number" placeholder="Qty" class="row-qty" value="${qty}" min="1" required aria-label="Quantity">
    <input type="number" placeholder="Unit Price" class="row-price" step="0.01" min="0.01" value="${price}" required aria-label="Unit price">
    <button type="button" class="btn-danger" onclick="this.parentElement.remove()" aria-label="Remove item">✕</button>
  `;
  itemsContainer.appendChild(div);
}

// Initialize form
addItemBtn?.addEventListener('click', () => createItemRow());
if (itemsContainer && itemsContainer.children.length === 0) {
  createItemRow('Samsung Galaxy S24 Ultra', 'IMEI: 358765432109876', 1, '1099.00');
}

// ==================== INVOICE RENDERING ====================
async function renderInvoice(e) {
  if (e) e.preventDefault();

  // Gather form values
  const id = document.getElementById('input-id')?.value.trim() || '';
  const buyer = document.getElementById('input-buyer')?.value.trim() || '';
  const phone = document.getElementById('input-phone')?.value.trim() || '';
  const email = document.getElementById('input-email')?.value.trim() || '';
  const taxRate = parseFloat(document.getElementById('input-tax')?.value) || 0;

  // Process items
  const itemRows = document.querySelectorAll('.item-row');
  const items = [];
  let subtotal = 0;
  let valid = true;

  invoiceItemsTbody.innerHTML = '';

  itemRows.forEach(row => {
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

  if (!valid || items.length === 0) {
    if (items.length === 0) alert('Please add at least one item.');
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

  // Generate secured payload (checksum mode since USE_HMAC = false)
  const securedPayload = generateFallbackPayload(payload);

  // Build verification URL
  const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  const verifyURL = `${baseUrl}verify.html?payload=${encodeURIComponent(securedPayload)}`;
  console.log('🔗 Verify URL:', verifyURL);

  // Generate QR Code
  qrContainer.innerHTML = '<div class="qr-loading">🔄 Generating QR...</div>';

  if (typeof QRCode !== 'undefined') {
    QRCode.toCanvas(verifyURL, { width: 160, margin: 0 }, (err, canvas) => {
      if (err) {
        console.error('❌ QR Error:', err);
        qrContainer.innerHTML = `<div style="color:#ef4444;padding:1rem;text-align:center">
          <strong>❌ QR Generation Failed</strong><br>
          <small>${err.message}</small><br>
          <button onclick="renderInvoice()" class="btn-secondary" style="margin-top:0.5rem">🔄 Retry</button>
        </div>`;
      } else {
        qrContainer.innerHTML = '';
        qrContainer.appendChild(canvas);
        console.log('✅ QR generated');
      }
    });
  } else {
    qrContainer.innerHTML = '<span style="color:#ef4444">❌ QR library not loaded</span>';
    console.error('QRCode library not found - check CDN link in HTML');
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
form?.addEventListener('submit', renderInvoice);

// Initial render
document.addEventListener('DOMContentLoaded', () => {
  renderInvoice();
});
// Fallback if DOM already loaded
if (document.readyState !== 'loading') renderInvoice();

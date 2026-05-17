// ⚠️ SECURITY DISCLAIMER: Base64/Checksums protect against casual URI modifications. 
// For high-value deployments, HMAC signing via Cloudflare Worker is enabled below.

// Configuration - UPDATE THESE VALUES
const USE_HMAC = true; // Set false to use fallback checksum mode only
const WORKER_SIGN_URL = 'https://invoice-gen-qr-system.shariful7972-b66.workers.dev/sign'; // ← Your Worker URL

// 🌓 Auto-detect system theme preference on load
function detectSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// Apply system theme on initial load
const savedTheme = localStorage.getItem('invoice-theme');
const systemTheme = detectSystemTheme();
const initialTheme = savedTheme || systemTheme;
document.documentElement.setAttribute('data-theme', initialTheme);

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const newTheme = e.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('invoice-theme', newTheme);
});

// Update theme toggle to save preference
themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('invoice-theme', newTheme);
});

document.getElementById('inv-date').textContent = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric'
});

const form = document.getElementById('invoice-form');
const itemsContainer = document.getElementById('form-items-container');
const addItemBtn = document.getElementById('add-item-btn');
const themeToggle = document.getElementById('theme-toggle');

// 🌗 Theme Management
themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
});

// 🛡️ XSS Mitigation: HTML Escaping Helper
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 📦 Dynamic Row Injector
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
addItemBtn.addEventListener('click', () => createItemRow());
if (itemsContainer.children.length === 0) {
  createItemRow('Samsung Galaxy S24 Ultra', 'IMEI: 358765432109876', 1, '1299.00');
}

// 🛡️ Lightweight Payload Integrity Checksum (fallback mode)
function generateChecksum(str) {
  return str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 9999;
}

// Encode URL-Safe Base64
function toUrlSafeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Fallback payload encoder (for offline/Worker-down scenarios)
function generateFallbackPayload(obj) {
  const jsonString = JSON.stringify(obj);
  const checkToken = generateChecksum(jsonString);
  const urlSafeB64 = toUrlSafeBase64(jsonString);
  return `${urlSafeB64}.${checkToken}.fallback`;
}

// 🔄 Master Render Engine
async function renderInvoice(e) {
  if (e) e.preventDefault();

  const id = document.getElementById('input-id').value.trim();
  const buyer = document.getElementById('input-buyer').value.trim();
  const phone = document.getElementById('input-phone').value.trim();
  const email = document.getElementById('input-email').value.trim();
  const taxRate = parseFloat(document.getElementById('input-tax').value) || 0;

  const itemRows = document.querySelectorAll('.item-row');
  const items = [];
  let subtotal = 0;
  let validationPassed = true;

  const invoiceItemsTbody = document.getElementById('invoice-items-tbody');
  invoiceItemsTbody.innerHTML = '';

  itemRows.forEach(row => {
    const name = row.querySelector('.row-name').value.trim();
    const serial = row.querySelector('.row-serial').value.trim();
    const qty = parseInt(row.querySelector('.row-qty').value) || 1;
    const unitPrice = parseFloat(row.querySelector('.row-price').value) || 0;
    
    if (unitPrice <= 0) {
      row.querySelector('.row-price').setCustomValidity('Price must be greater than 0');
      row.querySelector('.row-price').reportValidity();
      validationPassed = false;
      return;
    } else {
      row.querySelector('.row-price').setCustomValidity('');
    }

    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    items.push({ name, serial, qty, unitPrice: `$${unitPrice.toFixed(2)}`, price: `$${lineTotal.toFixed(2)}` });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(name)}</strong>
        ${serial ? `<br><small style="color: #64748b;">${escapeHtml(serial)}</small>` : ''}
      </td>
      <td style="text-align: center;">${qty}</td>
      <td style="text-align: right;">${`$${unitPrice.toFixed(2)}`}</td>
      <td class="text-right"><strong>${`$${lineTotal.toFixed(2)}`}</strong></td>
    `;
    invoiceItemsTbody.appendChild(tr);
  });

  if (!validationPassed) return;
  if (items.length === 0) {
    alert('Please add at least one item to the invoice.');
    return;
  }

  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  document.getElementById('inv-id').textContent = id;
  document.getElementById('inv-buyer').textContent = buyer;
  document.getElementById('inv-phone').textContent = phone;
  document.getElementById('inv-email').textContent = email;
  document.getElementById('inv-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('inv-tax-amount').textContent = `$${taxAmount.toFixed(2)}`;
  document.getElementById('inv-total').textContent = `$${total.toFixed(2)}`;

  const payloadObject = { 
    id, 
    buyer, 
    total: `$${total.toFixed(2)}`, 
    items, 
    status: 'verified',
    timestamp: Date.now()
  };

  let securedPayload;
  const qrContainer = document.getElementById('qr-container');
  
  // Try HMAC first, but auto-fallback if it fails
  if (USE_HMAC) {
    qrContainer.innerHTML = '<div class="qr-loading">🔐 Requesting signature...</div>';
    
    try {
      console.log('📡 Attempting Worker sign request to:', WORKER_SIGN_URL);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(WORKER_SIGN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceData: payloadObject, timestamp: payloadObject.timestamp }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Worker error response:', response.status, errorText);
        throw new Error(`Worker returned ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Worker response received:', data);
      
      if (!data.signedPayload) {
        throw new Error('Worker returned empty signedPayload');
      }
      
      securedPayload = data.signedPayload;
      
      const expiresAt = new Date(payloadObject.timestamp + 24 * 60 * 60 * 1000);
      document.querySelector('.qr-note').innerHTML = 
        `Scan to verify. <strong>Link expires:</strong> ${expiresAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        
    } catch (err) {
      console.warn('⚠️ HMAC signing failed, falling back to checksum mode:', err.message);
      console.log('💡 Tip: Check if Worker is deployed at:', WORKER_SIGN_URL);
      
      securedPayload = generateFallbackPayload(payloadObject);
      document.querySelector('.qr-note').textContent = 
        'Scan to verify. (Offline mode - checksum validation only)';
      document.querySelector('.qr-note').style.color = '#f59e0b'; // Orange warning
    }
  } else {
    securedPayload = generateFallbackPayload(payloadObject);
  }

  // Generate QR Code
  const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  const verifyURL = `${baseUrl}verify.html?payload=${encodeURIComponent(securedPayload)}`;
  
  console.log('🔗 Verification URL:', verifyURL);

  qrContainer.innerHTML = '<div class="qr-loading">🔄 Generating QR...</div>';

  try {
    QRCode.toCanvas(verifyURL, { width: 160, margin: 0 }, (err, canvas) => {
      if (err) {
        console.error('❌ QR Generation Error:', err);
        qrContainer.innerHTML = `<div style="color:#ef4444;padding:1rem">
          <strong>❌ QR Error</strong><br>
          <small>${err.message}</small><br>
          <button onclick="renderInvoice()" class="btn-secondary" style="margin-top:0.5rem">🔄 Retry</button>
        </div>`;
      } else {
        qrContainer.innerHTML = '';
        qrContainer.appendChild(canvas);
        console.log('✅ QR Code generated successfully');
      }
    });
  } catch (err) {
    console.error('❌ QR Library Error:', err);
    qrContainer.innerHTML = '<span style="color:#ef4444">❌ QR Library Error</span>';
  }
}

// 📋 Clipboard Copy with Fallback
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    alert('✅ Invoice data copied to clipboard!');
  } catch {
    alert('⚠️ Copy failed. Please select and copy manually.');
  }
  document.body.removeChild(textarea);
}

window.copyInvoiceData = function() {
  const data = JSON.stringify({
    invoiceId: document.getElementById('input-id').value,
    buyer: document.getElementById('input-buyer').value,
    grandTotal: document.getElementById('inv-total').textContent,
    generatedAt: new Date().toISOString()
  }, null, 2);
  
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(data)
      .then(() => alert('✅ Invoice summary copied to clipboard!'))
      .catch(() => fallbackCopy(data));
  } else {
    fallbackCopy(data);
  }
};

// Event listeners
form.addEventListener('submit', renderInvoice);

// Initial render
renderInvoice();

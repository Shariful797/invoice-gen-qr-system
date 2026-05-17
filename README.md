# 🔐 Secure Invoice Generator with QR Verification

A production-ready, static invoicing system with cryptographic QR verification, hosted entirely on Cloudflare.

![Invoice Preview](https://via.placeholder.com/800x400/2563eb/ffffff?text=Invoice+Preview+Screenshot)
*Figure: Generated invoice with QR code (dark mode shown)*

## ✨ Features

- ✅ **Multi-item invoices** with quantity, serial/IMEI tracking
- ✅ **Dynamic QR codes** that link to cryptographic verification
- ✅ **HMAC-SHA256 signing** via Cloudflare Workers (tamper-proof)
- ✅ **Fallback checksum mode** for offline resilience
- ✅ **Dark/Light theme** with print-optimized CSS
- ✅ **XSS-safe rendering** with HTML escaping
- ✅ **Mobile-responsive** tables and forms
- ✅ **Zero database** required - fully serverless

## 🚀 Quick Start: Deploy to Cloudflare (10 Minutes)

### Prerequisites
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier)
- [Node.js 18+](https://nodejs.org/) installed locally
- Basic terminal/command line knowledge

---

### Step 1: Fork & Clone the Repository

```bash
# Fork this repo on GitHub, then:
git clone https://github.com/Shariful797/invoice-qr-system.git
cd invoice-qr-system

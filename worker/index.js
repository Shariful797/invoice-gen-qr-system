/**
 * Cloudflare Worker for HMAC-SHA256 Invoice Signing
 * Deploy via: wrangler deploy
 * Set secret via: wrangler secret put HMAC_SECRET
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only POST allowed for signing/verification
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      const { invoiceData, timestamp, payload } = await request.json();

      // Route: /sign - Create HMAC signature
      if (url.pathname === '/sign' || url.pathname.endsWith('/sign')) {
        if (!invoiceData?.id || !invoiceData?.buyer || !timestamp) {
          return new Response(JSON.stringify({ error: 'Missing required fields: id, buyer, timestamp' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // 🔐 HMAC-SHA256 Signing
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(env.HMAC_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );

        // Sign: JSON + timestamp to bind them
        const payloadStr = JSON.stringify(invoiceData) + ':' + timestamp;
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));
        const signature = Array.from(new Uint8Array(signatureBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Return signed package
        const signedPackage = { ...invoiceData, timestamp, signature };
        const signedPayload = toUrlSafeBase64(JSON.stringify(signedPackage));

        return new Response(JSON.stringify({
          signedPayload,
          expiresAt: new Date(timestamp + 24 * 60 * 60 * 1000).toISOString()
        }), { headers: corsHeaders });
      }

      // Route: /verify - Validate HMAC signature
      if (url.pathname === '/verify' || url.pathname.endsWith('/verify')) {
        if (!payload?.signature || !payload?.timestamp) {
          return new Response(JSON.stringify({ valid: false, reason: 'Missing signature or timestamp' }), {
            headers: corsHeaders
          });
        }

        const { signature, timestamp, ...data } = payload;
        
        // Reconstruct original signed string
        const originalPayload = JSON.stringify(data) + ':' + timestamp;
        
        // Re-sign and compare
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(env.HMAC_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        
        const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(originalPayload));
        const expectedSig = Array.from(new Uint8Array(expectedSigBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        const isValid = signature === expectedSig;
        
        // Optional: Log verification attempt (requires KV binding)
        // if (env.AUDIT_LOGS) {
        //   await env.AUDIT_LOGS.put(`audit:${Date.now()}:${payload.id}`, JSON.stringify({ isValid, timestamp, ip: request.headers.get('cf-connecting-ip') }));
        // }

        return new Response(JSON.stringify({ 
          valid: isValid, 
          reason: isValid ? null : 'Signature mismatch or tampering detected' 
        }), { headers: corsHeaders });
      }

      // Unknown route
      return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
        status: 404,
        headers: corsHeaders
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// Helper: URL-safe Base64 encoding
function toUrlSafeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

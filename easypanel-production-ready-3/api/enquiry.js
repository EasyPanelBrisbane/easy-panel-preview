const allowed = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024;
const clean = (value, max = 1500) => String(value ?? '').trim().slice(0, max);
const respond = (res, status, message) => res.status(status).json({ message });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return respond(res, 405, 'Method not allowed.');
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return respond(res, 415, 'JSON content type required.');
  const expectedOrigin = process.env.ENQUIRY_ALLOWED_ORIGIN;
  const deploymentOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (!expectedOrigin || (req.headers.origin !== expectedOrigin && req.headers.origin !== deploymentOrigin)) return respond(res, 403, 'Origin not allowed.');
  const { M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET } = process.env;
  if (!M365_TENANT_ID || !M365_CLIENT_ID || !M365_CLIENT_SECRET) return respond(res, 503, 'Enquiries are temporarily unavailable. Please phone or email us.');
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > 3 * 1024 * 1024 || JSON.stringify(req.body || {}).length > 3 * 1024 * 1024) return respond(res, 413, 'Request too large.');

  const data = req.body || {};
  if (data.website) return respond(res, 200, 'Thank you for your enquiry.');
  const started = Number(data.formStartedAt);
  const elapsed = Date.now() - started;
  if (!Number.isFinite(started) || elapsed < 1800 || elapsed > 2 * 60 * 60 * 1000) return respond(res, 400, 'Please reload the form and try again.');

  const name = clean(data.name, 120), phone = clean(data.phone, 50), email = clean(data.email, 200), postcode = clean(data.postcode, 4);
  const product = clean(data.product, 100), message = clean(data.message, 3000);
  if (!name || !phone || !emailPattern.test(email) || !/^\d{4}$/.test(postcode) || !product || !message || data.consent !== true) return respond(res, 400, 'Please complete the required fields.');
  const files = Array.isArray(data.files) ? data.files : [];
  if (files.length > 3) return respond(res, 400, 'Please attach no more than three files.');
  let total = 0;
  const attachments = [];
  for (const file of files) {
    const filename = clean(file.name, 120).replace(/[\\/\r\n]/g, '_');
    const content = String(file.content || '');
    if (!allowed.has(file.type) || !/^[A-Za-z0-9+/]*={0,2}$/.test(content) || !filename || content.length > Math.ceil(MAX_FILE / 3) * 4 + 4) return respond(res, 400, 'An attachment is invalid.');
    const bytes = Buffer.from(content, 'base64');
    total += bytes.length;
    if (bytes.length > MAX_FILE || total > MAX_TOTAL) return respond(res, 413, 'Attachments exceed the size limit (2 MB total).');
    const signatures = {
      'application/pdf': bytes.subarray(0, 5).toString() === '%PDF-',
      'image/png': bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    };
    if (!signatures[file.type]) return respond(res, 400, 'File content does not match its format.');
    attachments.push({ '@odata.type': '#microsoft.graph.fileAttachment', name: filename, contentType: file.type, contentBytes: content });
  }

  const fields = {
    Name: name, Phone: phone, Email: email, 'Delivery postcode': postcode, Product: product,
    'Roof style': clean(data.roofstyle, 100), 'Decking project': clean(data.decktype, 100),
    Dimensions: clean(data.dimensions, 250), Message: message,
  };
  const text = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n');
  try {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(M365_TENANT_ID)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: M365_CLIENT_ID, client_secret: M365_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!tokenResponse.ok) { const identityError = await tokenResponse.json().catch(() => ({})); console.error('Microsoft identity token request failed:', tokenResponse.status, 'OAuth error:', String(identityError.error || 'unknown'), 'AADSTS codes:', Array.isArray(identityError.error_codes) ? identityError.error_codes.filter(code => Number.isInteger(code)) : []); return respond(res, 502, 'We could not send your enquiry. Please call or email us.'); }
    const { access_token: accessToken } = await tokenResponse.json();
    const mailbox = process.env.M365_MAILBOX || 'admin@easypanel.com.au';
    const mailResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: `Easy Panel enquiry: ${product} - ${postcode}`,
          body: { contentType: 'Text', content: text },
          toRecipients: [{ emailAddress: { address: mailbox } }],
          replyTo: [{ emailAddress: { address: email, name } }],
          ...(attachments.length ? { attachments } : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (!mailResponse.ok) { console.error('Microsoft Graph rejected enquiry:', mailResponse.status); return respond(res, 502, 'We could not send your enquiry. Please call or email us.'); }
    return respond(res, 200, 'Thank you. Your enquiry has been sent to Easy Panel.');
  } catch (error) {
    console.error('Microsoft 365 enquiry delivery failed:', error?.message);
    return respond(res, 502, 'We could not send your enquiry. Please call or email us.');
  }
}

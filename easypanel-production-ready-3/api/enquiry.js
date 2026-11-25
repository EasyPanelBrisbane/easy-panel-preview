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

  const name = clean(data.name, 120), phone = clean(data.phone, 50), email = clean(data.email, 200), postcode = clean(data.postcode);
  const product = clean(data.product, 100), message = clean(data.message, 3000);
  const enquiryLabel = data.enquiry_type === 'quick' ? 'Quick enquiry' :
    data.enquiry_type === 'detailed' ? 'Detailed quote' : '';
  if (!phone && !email) return respond(res, 400, 'Enter a phone number or email address so we can get back to you.');
  if (email && !emailPattern.test(email)) return respond(res, 400, 'Please enter a valid email address.');
  if (postcode && !/^\d{4}$/.test(postcode)) return respond(res, 400, 'Please enter a four-digit postcode.');
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

  const windClass = clean(data.wind_class, 30);
  const singleSkin = product === 'Single-skin roofing (DeltaSingle)';
  const roofDetails = singleSkin || ['Insulated roofing panels', 'Roofing and decking', 'Roofing accessories'].includes(product);
  const count = clean(singleSkin ? data.sheet_count : data.panel_count, 30);
  if (count && (!Number.isSafeInteger(Number(count)) || Number(count) < 1)) {
    return respond(res, 400, 'Enter a whole number of panels or sheets.');
  }
  const windReview = enquiryLabel === 'Detailed quote' && roofDetails && postcode && (!windClass || windClass === 'Unsure')
    ? 'Use the site postcode for an initial indication and confirm the site wind class.'
    : '';
  const fields = {
    'Enquiry type': enquiryLabel, Name: name, Phone: phone, Email: email, [enquiryLabel === 'Detailed quote' ? 'Project site postcode' : 'Delivery postcode']: postcode, Product: product,
    'Roof style': clean(data.roofstyle, 100), 'Decking project': clean(data.decktype, 100),
    Dimensions: clean(data.dimensions, 250),
    'Roof panel profile': singleSkin ? 'DeltaSingle' : clean(data.roof_profile, 80),
    'Open sides': clean(data.open_sides, 80),
    'Roof panel layout': clean(data.support_layout, 100),
    'Span between beams (m)': clean(data.panel_span_m, 30),
    [singleSkin ? 'Length of sheet (m)' : 'Length of panel (m)']: clean(singleSkin ? data.sheet_length_m : data.panel_length_m, 30),
    [singleSkin ? 'Width (number of 300 mm sheets)' : 'Width (number of 1 m panels)']: count ? String(Number(count)) : '',
    'Gutter-end overhang (m)': clean(data.gutter_overhang_m, 30),
    'Opposite-end overhang (m)': clean(data.opposite_overhang_m, 30),
    'Site wind class (customer supplied)': windClass,
    'Wind class follow-up': windReview,
    'Top-side roof colour': clean(data.roof_colour, 80),
    'Flashing colour': clean(data.flashing_colour, 80),
    'Post size': clean(data.post_size, 80),
    'Post mounting': clean(data.post_mount, 80),
    Message: message,
  };
  const text = Object.entries(fields).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join('\n');
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
          subject: ['Easy Panel enquiry', enquiryLabel, product, postcode].filter(Boolean).join(' - '),
          body: { contentType: 'Text', content: text },
          toRecipients: [{ emailAddress: { address: mailbox } }],
          ...(email ? { replyTo: [{ emailAddress: { address: email, ...(name ? { name } : {}) } }] } : {}),
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

const attachmentTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const attachmentLimit = 2 * 1024 * 1024;
const attachmentError = 'Please attach up to 3 JPG, PNG or PDF files, 2 MB total.';
const contactError = 'Enter a phone number or email address so we can get back to you.';
const deliveryError = 'Unable to send your enquiry. Please call (07) 3299 5541 or email admin@easypanel.com.au.';
const pageOpenedAt = Date.now();

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      content: String(reader.result).split(',')[1],
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

for (const form of document.querySelectorAll('[data-enquiry]')) {
  const { phone, email, product, files } = form.elements;
  const status = form.querySelector('.status');
  const submit = form.querySelector('button[type="submit"]');

  function updateProjectFields() {
    const sections = [
      [form.querySelector('[data-roofing]'), ['Insulated roofing panels', 'Roofing and decking', 'Roofing accessories']],
      [form.querySelector('[data-decking]'), ['Composite decking', 'Roofing and decking']],
    ];
    for (const [section, products] of sections) {
      if (!section) continue;
      section.hidden = !products.includes(product.value);
      section.querySelector('select').disabled = section.hidden;
    }
  }

  product.addEventListener('change', updateProjectFields);
  window.addEventListener('pageshow', updateProjectFields);
  updateProjectFields();

  function validateAttachments() {
    const attachments = Array.from(files.files);
    const totalBytes = attachments.reduce((total, file) => total + file.size, 0);
    const valid = attachments.length <= 3 && totalBytes <= attachmentLimit &&
      attachments.every(file => attachmentTypes.has(file.type));
    files.setCustomValidity(valid ? '' : attachmentError);
    return valid;
  }

  files?.addEventListener('change', () => {
    status.textContent = validateAttachments() ? '' : attachmentError;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (!phone.value.trim() && !email.value.trim()) {
      status.textContent = contactError;
      phone.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    status.textContent = 'Sending your enquiry…';
    submit.disabled = true;
    try {
      data.files = await Promise.all(Array.from(files?.files ?? [], readAttachment));
      data.formStartedAt = pageOpenedAt;
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      status.textContent = result.message || deliveryError;
      if (response.ok) {
        form.reset();
        updateProjectFields();
        window.gtag?.('event', 'generate_lead', {
          form_name: 'quote_request',
          enquiry_type: data.enquiry_type,
        });
      }
    } catch {
      status.textContent = deliveryError;
    } finally {
      submit.disabled = false;
    }
  });
}

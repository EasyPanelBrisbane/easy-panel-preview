const attachmentTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const attachmentLimit = 2 * 1024 * 1024;
const attachmentError = 'Please attach up to 3 JPG, PNG or PDF files, 2 MB total.';
const contactError = 'Enter a phone number or email address so we can get back to you.';
const deliveryError = 'Unable to send your enquiry. Please call (07) 3299 5541 or email admin@easypanel.com.au.';
const pageOpenedAt = Date.now();

const quoteToggle = document.getElementById('quote-toggle');
const quotePanel = document.getElementById('quote-panel');
const quoteHeading = document.getElementById('quote-heading');

quoteToggle.addEventListener('click', () => {
  const expanded = quotePanel.hidden;
  quotePanel.hidden = !expanded;
  quoteToggle.setAttribute('aria-expanded', String(expanded));
  if (expanded) quoteHeading.focus();
});

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

  const roofing = form.querySelector('[data-roofing]');
  const roofStyles = form.querySelector('[data-roof-style-options]');
  const oppositeOverhang = form.querySelector('[data-opposite-overhang]');

  function updateOppositeOverhang() {
    const attached = form.elements.roofstyle.value === 'Attached roof';
    oppositeOverhang.hidden = attached;
    form.elements.opposite_overhang_m.disabled = attached;
  }

  roofStyles?.addEventListener('change', updateOppositeOverhang);

  const decking = form.querySelector('[data-decking]');
  const accessories = form.querySelector('[data-accessories]');
  const accessoriesHeading = accessories?.querySelector('legend');
  const accessoryChoices = Array.from(accessories?.querySelectorAll('[name="accessory_items"]') ?? []);
  const accessoryDetails = Array.from(accessories?.querySelectorAll('[data-accessory-details]') ?? []);
  const partsOnlyChoices = Array.from(accessories?.querySelectorAll('[data-parts-only]') ?? []);
  const generalDimensions = form.querySelector('[data-general-dimensions]');
  const dimensionsLabel = generalDimensions?.querySelector('label');
  const dimensionsInput = generalDimensions?.querySelector('input');

  function updateProjectFields() {
    if (!roofing) return;

    const interest = product.value;
    const insulated = interest === 'Insulated roofing panels' || interest === 'Roofing and decking';
    const singleSkin = interest === 'Single-skin roofing (DeltaSingle)';
    const hasDecking = interest === 'Composite decking' || interest === 'Roofing and decking';
    const accessoriesOnly = interest === 'Roofing accessories';
    const sections = [
      [roofing, insulated || singleSkin],
      [accessories, insulated || singleSkin || accessoriesOnly],
      [decking, hasDecking],
      [roofing.querySelector('[data-insulated-measurements]'), insulated],
      [roofing.querySelector('[data-single-skin-only]'), singleSkin],
    ];
    for (const section of roofing.querySelectorAll('[data-insulated-only]')) {
      sections.push([section, !singleSkin]);
    }
    for (const [section, visible] of sections) {
      section.hidden = !visible;
      section.disabled = !visible;
    }
    accessoriesHeading.textContent = accessoriesOnly ? 'Roofing accessories' : 'Add accessories to my quote';
    for (const choice of partsOnlyChoices) {
      choice.hidden = !accessoriesOnly;
      choice.querySelector('input').disabled = !accessoriesOnly;
    }
    updateAccessoryDetails();
    const showGeneralDimensions = hasDecking || (!insulated && !singleSkin && !accessoriesOnly);
    generalDimensions.hidden = !showGeneralDimensions;
    dimensionsInput.disabled = !showGeneralDimensions;
    dimensionsLabel.textContent = hasDecking ? 'Approximate decking dimensions' : 'Approximate dimensions';
    updateOppositeOverhang();
  }

  function updateAccessoryDetails() {
    const selected = new Set(accessoryChoices.filter(choice => choice.checked && !choice.disabled).map(choice => choice.value));
    for (const section of accessoryDetails) {
      section.hidden = !selected.has(section.dataset.accessoryDetails);
      section.disabled = section.hidden;
    }
  }

  for (const choice of accessoryChoices) {
    choice.addEventListener('change', updateAccessoryDetails);
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

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    data.accessory_items = formData.getAll('accessory_items');
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

const quotedProducts = new Map([
  ['roofing', 'Insulated roofing panels'],
  ['decking', 'Composite decking'],
]);
const linkedProduct = quotedProducts.get(new URLSearchParams(window.location.search).get('quote'));
if (linkedProduct) {
  const product = document.getElementById('detailed-quote').elements.product;
  product.value = linkedProduct;
  product.dispatchEvent(new Event('change'));
  if (quotePanel.hidden) quoteToggle.click();
}

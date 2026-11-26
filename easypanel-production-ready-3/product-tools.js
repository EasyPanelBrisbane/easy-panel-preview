const number = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });
const dollars = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

for (const picker of document.querySelectorAll('[data-colour-picker]')) {
  const sample = picker.querySelector('[data-colour-sample]');
  const caption = picker.querySelector('[data-colour-caption]');
  const updateColour = () => {
    const selected = picker.querySelector('input:checked');
    if (!selected) return;
    sample.style.setProperty('--sample', selected.dataset.sample);
    caption.textContent = selected.value;
  };
  picker.addEventListener('change', updateColour);
  updateColour();
}

for (const form of document.querySelectorAll('[data-material-calculator]')) {
  const result = form.querySelector('output');
  form.addEventListener('input', () => { result.textContent = ''; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = form.elements;
    const length = Math.round(fields.length_m.valueAsNumber * 1000);
    const width = Math.round(fields.width_m.valueAsNumber * 1000);
    if (!Number.isSafeInteger(length) || !Number.isSafeInteger(width) || length < 1 || width < 1) return;
    const rate = fields.unit_price.valueAsNumber;
    if (form.dataset.materialCalculator === 'roofing') {
      const singleSkin = fields.material.value === 'single-skin';
      const count = Math.ceil(width / (singleSkin ? 300 : 1000));
      const totalLength = count * length / 1000;
      const label = singleSkin ? 'sheets' : 'panels';
      result.textContent = `${number.format(count)} ${label} at ${number.format(length / 1000)} m each (${number.format(totalLength)} lineal metres).`;
      if (Number.isFinite(rate)) result.textContent += ` Estimated materials cost at your rate: ${dollars.format(totalLength * rate)}.`;
    } else {
      const rows = Math.ceil((width + 4) / 144);
      const count = rows * Math.ceil(length / 5400);
      result.textContent = `${number.format(rows)} board rows and about ${number.format(count)} full-length boards, allowing one board per piece without reusing offcuts.`;
      if (Number.isFinite(rate)) result.textContent += ` Estimated board cost at your rate: ${dollars.format(count * rate)}.`;
    }
  });
}

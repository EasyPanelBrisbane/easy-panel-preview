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

for (const form of document.querySelectorAll('[data-material-calculator="decking"]')) {
  const boardPriceCents = 7040;
  const standardClipBoxPriceCents = 5000;
  const result = form.querySelector('output');
  const plural = (count, word) => `${number.format(count)} ${word}${count === 1 ? '' : 'es'}`;

  const spacing = form.elements.joist_spacing;

  function calculate() {
    const lengthMm = Math.round(form.elements.length_m.valueAsNumber * 1000);
    const widthMm = Math.round(form.elements.width_m.valueAsNumber * 1000);
    const areaMm2 = lengthMm * widthMm;
    if (lengthMm < 1 || widthMm < 1 || !Number.isSafeInteger(areaMm2)) return;

    const areaM2 = areaMm2 / 1_000_000;
    const boards = Math.ceil(areaMm2 * 7 / 5_400_000);
    const spacingMm = spacing.value === '350' ? 350 : 400;
    const clipBoxCoverageMm2 = 3_500_000 * spacingMm / 350;
    const standardClipBoxes = Math.ceil(areaMm2 / clipBoxCoverageMm2);
    const starterClips = Math.ceil(areaMm2 / (spacingMm * 5400));
    const starterClipBoxes = Math.ceil(starterClips / 20);
    const estimateCents = boards * boardPriceCents + standardClipBoxes * standardClipBoxPriceCents;
    result.textContent = [
      `${number.format(areaM2)} m² · ${number.format(boards)} × 5.4 m boards`,
      `${plural(standardClipBoxes, 'box')} of standard clips (100 per box)`,
      `${plural(starterClipBoxes, 'box')} of starter clips (20 per box)`,
      `Estimated boards and standard clips: ${dollars.format(estimateCents / 100)} incl. GST.`,
    ].join('\n');
  }

  form.addEventListener('input', event => {
    if (event.target !== spacing) result.textContent = '';
  });
  spacing.addEventListener('change', () => {
    if (result.textContent) calculate();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    calculate();
  });
}

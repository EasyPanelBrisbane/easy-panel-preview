const businessPhoneLinks = document.querySelectorAll(
  'a[href="tel:+61732995541"], a[href="tel:0732995541"]',
);
const businessNumber = /(?:\(07\)|07|\+61 7) 3299 5541/;
const phoneLabels = [];

for (const link of businessPhoneLinks) {
  const labels = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  while (labels.nextNode()) {
    const node = labels.currentNode;
    if (businessNumber.test(node.data)) phoneLabels.push([node, node.data]);
  }
}

window.gtag?.('config', 'AW-830972035', { groups: 'google_ads' });
window.gtag?.('config', 'AW-830972035/CMK2CMHHqPcDEIPBnowD', {
  phone_conversion_number: '07 3299 5541',
  phone_conversion_callback(formattedNumber, mobileNumber) {
    if (!formattedNumber || !/^\+?\d+$/.test(mobileNumber)) return;

    for (const link of businessPhoneLinks) link.href = `tel:${mobileNumber}`;
    for (const [node, originalLabel] of phoneLabels) {
      node.data = originalLabel.replace(businessNumber, () => formattedNumber);
    }
  },
});

document.addEventListener('click', event => {
  if (event.defaultPrevented || !event.target.closest?.('a[href^="tel:" i]')) {
    return;
  }

  window.gtag?.('event', 'click_to_call');
});

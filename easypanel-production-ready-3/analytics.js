document.addEventListener('click', event => {
  if (event.defaultPrevented || !event.target.closest?.('a[href^="tel:" i]')) {
    return;
  }

  window.gtag?.('event', 'click_to_call');
});

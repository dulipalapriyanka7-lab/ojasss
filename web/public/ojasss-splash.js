(() => {
  const splash = document.getElementById('ojasss-static-splash');
  if (!splash) return;
  const retry = splash.querySelector('button');
  retry.addEventListener('click', () => window.location.reload());
  window.setTimeout(() => {
    if (!splash.isConnected) return;
    splash.querySelector('.oj-splash-state').textContent = 'OJASSS took too long to start.';
    splash.querySelector('.oj-splash-progress').hidden = true;
    retry.hidden = false;
  }, 20000);
})();

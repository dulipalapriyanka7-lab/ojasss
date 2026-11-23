// Applies the saved/system theme before first paint (no flash). External file so the CSP needs no inline scripts.
(function () {
  try {
    var p = localStorage.getItem('ojasss-theme');
    var dark = p !== 'light' && (p !== 'system' || matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
if(/OjasssAndroid/.test(navigator.userAgent))document.documentElement.classList.add('oj-in-app');

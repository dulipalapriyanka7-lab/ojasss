// Verified Android App Links normally open the app before the browser loads.
// Offer an intent handoff for browsers inside sharing apps, with a loop-free web fallback.
(() => {
 if(!/Android/i.test(navigator.userAgent)||/OjasssAndroid/i.test(navigator.userAgent))return;
 const url=new URL(location.href);
 if(!/^\/post\/[a-f0-9-]{36}\/?$/i.test(url.pathname)||url.searchParams.has('app_fallback'))return;
 const fallback=new URL(url);fallback.searchParams.set('app_fallback','1');
 const intent=`intent://${url.host}${url.pathname}#Intent;scheme=https;package=com.ojasss.app;S.browser_fallback_url=${encodeURIComponent(fallback.href)};end`;
 // Browsers that require a user gesture can retain the fully usable web page.
 try{location.replace(intent);}catch{/* Continue on the website. */}
})();

export function publicSiteUrl(configured:string,origin:string|undefined,production:boolean):string {
 return (production&&origin&&/^https?:\/\//.test(origin)?origin:configured||'https://ojasss.com').replace(/\/$/,'');
}

export function parseHashtags(value:string):string[]{return [...new Set(value.split(/[\s,]+/).map(tag=>tag.replace(/^#+/,'')).filter(Boolean))];}
export function validHashtags(tags:string[]):boolean{return tags.length<=20&&tags.every(tag=>/^[\p{L}\p{M}\p{N}_]{1,40}$/u.test(tag));}
export function validSource(value:string):boolean{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}

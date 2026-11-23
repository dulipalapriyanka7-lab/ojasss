import { iso6393 } from '../web/node_modules/iso-639-3/index.js';
import { iso31661 } from '../web/node_modules/iso-3166/index.js';
import { writeFileSync } from 'node:fs';
const names = new Intl.DisplayNames(['en'], {type:'region'});
const countries=iso31661.map(c=>({value:c.alpha2,label:names.of(c.alpha2)??c.name})).sort((a,b)=>a.label.localeCompare(b.label));
const languages=iso6393.map(l=>({value:l.iso6391??l.iso6393,label:l.name})).sort((a,b)=>a.label.localeCompare(b.label));
writeFileSync(new URL('../web/src/lib/regionData.ts',import.meta.url),`// Generated from ISO 3166-1 and ISO 639-3; run tools/generate-regions.mjs.\nexport const COUNTRIES = ${JSON.stringify(countries)};\nexport const WORLD_LANGUAGES = ${JSON.stringify(languages)};\n`);
writeFileSync(new URL('../hostinger/api/country-codes.php',import.meta.url),`<?php return ${JSON.stringify(countries.map(c=>c.value)).replaceAll('"',"'")};\n`);
console.log(`Generated ${countries.length} countries and ${languages.length} languages.`);

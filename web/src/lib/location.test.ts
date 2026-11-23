import { describe, expect, it } from 'vitest';
import { parseCoordinates, placeName } from './location';
describe('place names',()=>{
 it('validates and parses existing coordinate labels',()=>{expect(parseCoordinates('16.54° N, 80.57° E')).toEqual([16.54,80.57]);expect(parseCoordinates('91.00° N, 80.57° E')).toBeNull();expect(parseCoordinates('Vijayawada')).toBeNull();});
 it('uses a city and state instead of a street address',()=>{expect(placeName([{address_components:[{long_name:'Street 123',types:['route']},{long_name:'Vijayawada',types:['locality']},{long_name:'Andhra Pradesh',types:['administrative_area_level_1']},{long_name:'India',types:['country']}]}])).toBe('Vijayawada, Andhra Pradesh, India');});
});

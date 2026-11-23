import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approximateLocation, useUploadLocation } from '@/hooks/useUploadLocation';

vi.mock('@/lib/location',()=>({resolvePlace:vi.fn().mockResolvedValue('Hyderabad, Telangana, India')}));

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('upload location',()=>{
  it('rounds the public location instead of exposing exact coordinates',()=>{
    expect(approximateLocation(17.385044,78.486671)).toBe('17.39° N, 78.49° E');
    expect(approximateLocation(-12.345,-45.678)).toBe('12.35° S, 45.68° W');
  });
  it('requests permission and inserts a city name only when detection succeeds',async()=>{
    let success: PositionCallback=()=>{};const getCurrentPosition=vi.fn((s:PositionCallback)=>{success=s;});
    vi.stubGlobal('navigator',{geolocation:{getCurrentPosition}});const detected=vi.fn();
    const hook=renderHook(()=>useUploadLocation(true,detected));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);expect(detected).not.toHaveBeenCalled();
    await act(async()=>{success({coords:{latitude:17.385,longitude:78.486}} as GeolocationPosition);});
    expect(detected).toHaveBeenCalledWith('Hyderabad, Telangana, India');expect(hook.result.current.busy).toBe(false);
  });
  it('never overwrites a manual edit or restores a removed location after a late response',async()=>{
    let success:PositionCallback=()=>{};vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(s:PositionCallback)=>{success=s;}}});
    const detected=vi.fn();const hook=renderHook(()=>useUploadLocation(true,detected));
    act(()=>hook.result.current.markEdited());await act(async()=>{success({coords:{latitude:1,longitude:2}} as GeolocationPosition);});
    expect(detected).not.toHaveBeenCalled();expect(hook.result.current.busy).toBe(false);
  });
  it('allows continuing without location after permission is denied',()=>{
    let denied:PositionErrorCallback=()=>{};vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(_:PositionCallback,e:PositionErrorCallback)=>{denied=e;}}});
    const detected=vi.fn();const hook=renderHook(()=>useUploadLocation(true,detected));
    act(()=>denied({code:1} as GeolocationPositionError));expect(detected).not.toHaveBeenCalled();
    expect(hook.result.current.message).toContain('continue without one');expect(hook.result.current.busy).toBe(false);
  });
});

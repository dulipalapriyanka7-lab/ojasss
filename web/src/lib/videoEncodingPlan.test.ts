import {it,expect} from 'vitest';
import {videoEncodingPlan} from './videoEncodingPlan';
it('keeps full HD landscape and portrait dimensions',()=>{expect(videoEncodingPlan(1920,1080,'hd')).toMatchObject({width:1920,height:1080});expect(videoEncodingPlan(1080,1920,'hd')).toMatchObject({width:1080,height:1920});});
it('bounds 4K to HD while preserving aspect ratio',()=>{expect(videoEncodingPlan(3840,2160,'hd')).toMatchObject({width:1920,height:1080});});
it('does not upscale low resolution media and aligns encoders to even dimensions',()=>{expect(videoEncodingPlan(641,359,'hd')).toMatchObject({width:640,height:358});});
it('offers a lower bitrate and 720p for faster loading',()=>{const fast=videoEncodingPlan(1080,1920,'fast');expect(fast).toMatchObject({width:720,height:1280});expect(fast.bitrate).toBeLessThan(videoEncodingPlan(1080,1920,'hd').bitrate);});

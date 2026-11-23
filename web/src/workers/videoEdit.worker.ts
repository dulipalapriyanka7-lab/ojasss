import { ALL_FORMATS, AudioSample, AudioSampleSink, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality , VideoSample } from 'mediabunny';
import { paintEditFrame, videoEditDimensions, type VideoEdit , cutShift, keptSeconds } from '@/lib/videoEdit';

type EditRequest = { file: File; edit: VideoEdit; width: number; height: number; maxBytes: number; edge: number };
type WaveformRequest = { file: File; waveform: true; seconds: number };

async function audioPeaks(input: Input, seconds: number) {
  const track = await input.getPrimaryAudioTrack();
  if (!track || !(await track.canDecode())) return null;
  const start = await track.getFirstTimestamp();
  const peaks = new Float32Array(84);
  const sink = new AudioSampleSink(track);
  for await (const sample of sink.samples(start, start + seconds)) {
    try {
      const data = new Float32Array(sample.numberOfFrames);
      sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
      for (let i = 0; i < data.length; i += 4) {
        const bin = Math.floor((sample.timestamp - start + i / sample.sampleRate) / seconds * peaks.length);
        if (bin >= 0 && bin < peaks.length) peaks[bin] = Math.max(peaks[bin], Math.abs(data[i]));
      }
    } finally {
      sample.close();
    }
  }
  const peak = Math.max(.03, ...peaks);
  return Array.from(peaks, value => value / peak);
}

self.onmessage = async (event: MessageEvent<EditRequest | WaveformRequest>) => {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(event.data.file) });
  if ('waveform' in event.data) {
    try {
      self.postMessage({ peaks: await audioPeaks(input, event.data.seconds) });
    } catch {
      self.postMessage({ peaks: null });
    } finally {
      input.dispose();
    }
    return;
  }
  const { edit, width, height, maxBytes, edge } = event.data;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no video track.');
    const firstFrame = await track.getFirstTimestamp();
    const audioTrack = await input.getPrimaryAudioTrack();
    const trim = { start: Math.max(0, firstFrame + edit.start), end: firstFrame + edit.end };
    const size = videoEditDimensions(width, height, edit, edge);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');
    if (!context || typeof VideoEncoder === 'undefined') throw new Error('This browser cannot export edits. Open OJASSS in an updated Chrome browser.');
    if (!('filter' in context) && [edit.brightness, edit.contrast, edit.saturation].some(value => value !== 100)) {
      throw new Error('Color adjustments require an updated Chrome browser.');
    }
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const bitrate = Math.max(100_000, Math.min(edge <= 1280 ? 2_500_000 : 6_000_000, Math.floor(maxBytes * 7 / Math.max(.5, keptSeconds(edit)) - 192_000)));
    const conversion = await Conversion.init({
      input, output, tracks: 'primary', trim,
      video: {
        codec: 'avc', forceTranscode: true, quality: new Quality({ bitrate }),
        processedWidth: size.width, processedHeight: size.height,
        process: sample => {
          const shift = cutShift(edit, sample.timestamp - firstFrame);
          if (shift < 0) return null;
          paintEditFrame(context, sample.displayWidth, sample.displayHeight, edit, sample.timestamp - firstFrame, (...args) => sample.draw(context, ...args));
          return shift ? new VideoSample(canvas, { timestamp: sample.timestamp - shift, duration: sample.duration }) : canvas;
        },
      },
      audio: edit.volume === 0 ? { discard: true } : {
        codec: 'aac',
        process: edit.volume === 1 && !edit.cuts?.length ? undefined : sample => {
          const shift = cutShift(edit, sample.timestamp - firstFrame);
          if (shift < 0) return null;
          const samples = new Float32Array(sample.numberOfFrames * sample.numberOfChannels);
          sample.copyTo(samples, { planeIndex: 0, format: 'f32' });
          for (let i = 0; i < samples.length; i++) samples[i] *= edit.volume;
          return new AudioSample({ data: samples, format: 'f32', numberOfChannels: sample.numberOfChannels, sampleRate: sample.sampleRate, timestamp: sample.timestamp - shift });
        },
      },
    });
    if (!conversion.isValid || (audioTrack && edit.volume !== 0 && conversion.discardedTracks.some(item => item.track.id === audioTrack.id))) {
      throw new Error('This device cannot encode this video and its audio as MP4. Try an updated Chrome browser, or reset edits and continue with the original.');
    }
    conversion.onProgress = progress => self.postMessage({ progress });
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error('Export did not produce a playable video.');
    if (target.buffer.byteLength > maxBytes) throw new Error('The export exceeds the upload size limit. Choose 720p or trim the clip.');
    self.postMessage({ blob: new Blob([target.buffer], { type: 'video/mp4' }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Video export failed.' });
  } finally {
    input.dispose();
  }
};

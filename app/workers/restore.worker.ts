/* eslint-disable no-restricted-globals */
// TypeScript declaration for classic worker importScripts
declare function importScripts(...urls: string[]): void;

// Classic worker script (no imports/exports) so we can use importScripts

// Load OpenCV.js from CDN
let cvReady: Promise<void> | null = null;
function ensureCv(): Promise<void> {
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    try {
      (self as any).Module = {
        onRuntimeInitialized() {
          resolve();
        },
      };
      // Use stable 4.x CDN
      importScripts("https://docs.opencv.org/4.x/opencv.js");
    } catch (e) {
      reject(e);
    }
  });
  return cvReady;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

async function blobFromBuffer(buffer: ArrayBuffer): Promise<Blob> {
  return new Blob([buffer]);
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(blob);
}

function resizeBitmapToMax(bitmap: ImageBitmap, maxSide: number): OffscreenCanvas {
  const { width, height } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function cvMatFromCanvas(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // @ts-ignore
  return (self as any).cv.matFromImageData(imageData);
}

function putMatToCanvas(mat: any, canvas: OffscreenCanvas) {
  const dst = new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(dst, 0, 0);
}

function applyContrastBrightness(mat: any, contrastPct: number) {
  // contrastPct -50..50, brightness 0
  const alpha = 1 + contrastPct / 100; // contrast
  const beta = 0; // brightness
  const cv = (self as any).cv;
  const dst = new cv.Mat();
  cv.convertScaleAbs(mat, dst, alpha, beta);
  mat.delete();
  return dst;
}

function equalizeLuma(matRGBA: any) {
  const cv = (self as any).cv;
  const ycrcb = new cv.Mat();
  cv.cvtColor(matRGBA, ycrcb, cv.COLOR_RGBA2YCrCb);
  const channels = new cv.MatVector();
  cv.split(ycrcb, channels);
  const y = channels.get(0);
  cv.equalizeHist(y, y);
  channels.set(0, y);
  cv.merge(channels, ycrcb);
  const out = new cv.Mat();
  cv.cvtColor(ycrcb, out, cv.COLOR_YCrCb2RGBA);
  y.delete();
  channels.delete();
  ycrcb.delete();
  return out;
}

function denoiseColored(src: any, h: number) {
  const cv = (self as any).cv;
  const dst = new cv.Mat();
  // h values typical: 3-10
  cv.fastNlMeansDenoisingColored(src, dst, h, Math.max(2, h - 2), 7, 21);
  return dst;
}

function inpaintScratches(src: any, threshold: number) {
  const cv = (self as any).cv;
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const edges = new cv.Mat();
  // Canny thresholds from slider mapping
  const th1 = clamp(threshold, 0, 100);
  const t1 = 50 + th1; // 50..150
  const t2 = 2 * t1;   // 100..300
  cv.Canny(gray, edges, t1, t2, 3, true);
  // Thin and clean mask
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
  cv.morphologyEx(edges, edges, cv.MORPH_DILATE, kernel);
  cv.threshold(edges, edges, 10, 255, cv.THRESH_BINARY);
  const dst = new cv.Mat();
  cv.inpaint(src, edges, dst, 3, cv.INPAINT_TELEA);
  gray.delete();
  edges.delete();
  kernel.delete();
  return dst;
}

function unsharp(src: any, amount: number) {
  const cv = (self as any).cv;
  const blur = new cv.Mat();
  cv.GaussianBlur(src, blur, new cv.Size(0, 0), 1.0, 1.0, cv.BORDER_DEFAULT);
  const dst = new cv.Mat();
  cv.addWeighted(src, 1 + amount, blur, -amount, 0, dst);
  blur.delete();
  return dst;
}

function adjustSaturation(src: any, satPct: number) {
  const cv = (self as any).cv;
  const hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
  const channels = new cv.MatVector();
  cv.split(hsv, channels);
  const s = channels.get(1);
  const alpha = 1 + satPct / 100;
  s.convertTo(s, -1, alpha, 0);
  cv.threshold(s, s, 255, 255, cv.THRESH_TRUNC);
  channels.set(1, s);
  cv.merge(channels, hsv);
  const out = new cv.Mat();
  cv.cvtColor(hsv, out, cv.COLOR_HSV2RGBA);
  hsv.delete();
  channels.delete();
  s.delete();
  return out;
}

async function processBuffer(buffer: ArrayBuffer, options: any): Promise<Blob> {
  await ensureCv();
  const blob = await blobFromBuffer(buffer);
  const bitmap = await bitmapFromBlob(blob);
  const canvas = resizeBitmapToMax(bitmap, options.maxSize || 2000);
  const cv = (self as any).cv;
  let mat = cvMatFromCanvas(canvas);

  // Equalize luminance (gentle auto contrast on Y channel)
  let work = equalizeLuma(mat);
  mat.delete();

  // Denoise
  if (options.denoise > 0) {
    const d = clamp(options.denoise, 0, 30);
    const den = denoiseColored(work, d);
    work.delete();
    work = den;
  }

  // Scratch removal
  if (options.scratchRemoval > 0) {
    const repaired = inpaintScratches(work, clamp(options.scratchRemoval, 0, 100));
    work.delete();
    work = repaired;
  }

  // Contrast
  if (options.contrast !== 0) {
    const c = applyContrastBrightness(work, clamp(options.contrast, -50, 50));
    work.delete();
    work = c;
  }

  // Saturation
  if (options.saturation !== 0) {
    const s = adjustSaturation(work, clamp(options.saturation, -50, 50));
    work.delete();
    work = s;
  }

  // Sharpen
  if (options.sharpen > 0) {
    const sh = unsharp(work, clamp(options.sharpen, 0, 2));
    work.delete();
    work = sh;
  }

  putMatToCanvas(work, canvas);
  work.delete();

  const outBlob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return outBlob as Blob;
}

self.addEventListener('message', async (e: MessageEvent) => {
  const data = e.data as any;
  if (data?.type === 'process') {
    const { id, buffer, options } = data as { id: string; buffer: ArrayBuffer; options: any };
    try {
      const out = await processBuffer(buffer, options);
      const arr = await out.arrayBuffer();
      (self as any).postMessage({ type: 'done', id, buffer: arr, mime: out.type }, [arr]);
    } catch (err: any) {
      self.postMessage({ type: 'error', id, message: err?.message || 'Erro no processamento' });
    }
  }
});

// Signal readiness after OpenCV load kicks off
ensureCv()
  .then(() => self.postMessage({ type: 'ready' }))
  .catch(() => self.postMessage({ type: 'ready' }));

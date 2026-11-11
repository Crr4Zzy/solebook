// Barcode scanning with the browser's BarcodeDetector (Chrome on Android and desktop).
// Safari on iPhone does not have it yet, so the button is hidden there and you search by name.
let stream = null;
let timer = null;

export const scannerSupported = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

export async function startScanner(video, onCode, onError) {
  stopScanner();
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const tick = async () => {
      if (!stream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) { onCode(codes[0].rawValue); return; }
      } catch {}
      timer = setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    stopScanner();
    onError?.(e?.name === 'NotAllowedError' ? 'Sin permiso para usar la cámara' : 'No se ha podido abrir la cámara');
  }
}

export function stopScanner() {
  clearTimeout(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

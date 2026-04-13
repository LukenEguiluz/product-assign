import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, NotFoundException } from "@zxing/library";

type ScanProfile = "barcode" | "general";

type Props = {
  title: string;
  onScan: (text: string) => void;
  active: boolean;
  scanProfile?: ScanProfile;
};

function normalizeScannedText(raw: string): string {
  return (raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

/** Formatos que suele soportar BarcodeDetector en Chromium (nombres en kebab-case). */
const NATIVE_FORMATS_BARCODE = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "qr_code",
  "data_matrix",
  "pdf417",
  "aztec",
] as const;

const NATIVE_FORMATS_GENERAL = [
  "qr_code",
  "data_matrix",
  "code_128",
  "code_39",
  "pdf417",
  "aztec",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "codabar",
] as const;

function pickVideoTrackConstraints(
  devices: MediaDeviceInfo[],
): MediaTrackConstraints {
  if (devices.length === 0) {
    return { facingMode: "user" };
  }
  if (devices.length === 1) {
    return { deviceId: { ideal: devices[0].deviceId } };
  }
  const back = devices.find((d) => /back|rear|environment|trasera/i.test(d.label));
  if (back) {
    return { deviceId: { ideal: back.deviceId } };
  }
  const notIr = devices.find((d) => !/ir\b|infrared|depth|3d/i.test(d.label));
  return { deviceId: { ideal: (notIr ?? devices[0]).deviceId } };
}

async function waitVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error("Tiempo de espera del vídeo."));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(t);
      video.removeEventListener("loadeddata", onOk);
      video.removeEventListener("error", onErr);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Error al cargar el vídeo."));
    };
    video.addEventListener("loadeddata", onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

type StopFn = () => void;

type NativeDetector = {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

async function createNativeDetector(
  scanProfile: ScanProfile,
): Promise<NativeDetector | null> {
  const BD = (
    globalThis as typeof globalThis & {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => NativeDetector;
    }
  ).BarcodeDetector;
  if (!BD) return null;
  const want =
    scanProfile === "barcode"
      ? [...NATIVE_FORMATS_BARCODE]
      : [...NATIVE_FORMATS_GENERAL];
  try {
    const supported = await (
      BD as unknown as { getSupportedFormats?: () => Promise<string[]> }
    ).getSupportedFormats?.();
    const formats = supported?.length
      ? want.filter((f) => supported.includes(f))
      : want;
    if (!formats.length) return null;
    return new BD({ formats });
  } catch {
    return null;
  }
}

export default function CameraScanner({
  title,
  onScan,
  active,
  scanProfile = "general",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<StopFn | null>(null);
  const onScanRef = useRef(onScan);
  const lastTextRef = useRef<string>("");
  const lastAtRef = useRef(0);
  onScanRef.current = onScan;

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    stopRef.current = null;

    const releaseStream = () => {
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    };

    const finishSuccess = (text: string, stop: StopFn) => {
      const now = Date.now();
      if (text === lastTextRef.current && now - lastAtRef.current < 600) return;
      lastTextRef.current = text;
      lastAtRef.current = now;
      try {
        stop();
      } catch {
        /* ignore */
      }
      stopRef.current = null;
      releaseStream();
      onScanRef.current(text);
    };

    async function run() {
      setError(null);
      setRunning(false);

      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        );
        const base = pickVideoTrackConstraints(devices);
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            ...base,
            width: { min: 480, ideal: 1280, max: 1920 },
            height: { min: 360, ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        await waitVideoReady(video);
        if (cancelled) {
          releaseStream();
          return;
        }

        const detector = await createNativeDetector(scanProfile);
        if (detector && !cancelled) {
          const intervalMs = scanProfile === "barcode" ? 80 : 120;
          let busy = false;
          const timer = window.setInterval(() => {
            if (cancelled || busy) return;
            if (video.readyState < 2 || video.videoWidth < 8) return;
            busy = true;
            void (async () => {
              try {
                const codes = await detector.detect(video);
                if (cancelled || !codes?.length) return;
                const text = normalizeScannedText(codes[0].rawValue);
                if (!text) return;
                window.clearInterval(timer);
                if (!cancelled) {
                  finishSuccess(text, () => window.clearInterval(timer));
                }
              } catch {
                /* frame sin código */
              } finally {
                busy = false;
              }
            })();
          }, intervalMs);

          const stop: StopFn = () => {
            window.clearInterval(timer);
            releaseStream();
          };
          stopRef.current = stop;
          setRunning(true);
          return;
        }

        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 350,
        });

        const controls = await reader.decodeFromStream(
          stream,
          video,
          (result, err, ctrl) => {
            if (cancelled) return;
            if (err && !(err instanceof NotFoundException)) return;
            if (!result) return;
            const text = normalizeScannedText(result.getText());
            if (!text) return;
            const now = Date.now();
            if (text === lastTextRef.current && now - lastAtRef.current < 600) {
              return;
            }
            lastTextRef.current = text;
            lastAtRef.current = now;
            try {
              ctrl.stop();
            } catch {
              /* ignore */
            }
            stopRef.current = null;
            releaseStream();
            onScanRef.current(text);
          },
        );

        if (cancelled) {
          controls.stop();
          releaseStream();
          return;
        }
        stopRef.current = () => {
          try {
            controls.stop();
          } catch {
            /* ignore */
          }
          releaseStream();
        };
        setRunning(true);
      } catch (e) {
        if (!cancelled) {
          releaseStream();
          const msg =
            e instanceof Error ? e.message : "No se pudo abrir la cámara.";
          setError(
            `${msg} Use HTTPS o localhost, permita la cámara y pruebe Chrome o Edge.`,
          );
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      try {
        stopRef.current?.();
      } catch {
        /* ignore */
      }
      stopRef.current = null;
      lastTextRef.current = "";
      lastAtRef.current = 0;
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
      setRunning(false);
    };
  }, [active, scanProfile]);

  if (!active) return null;

  return (
    <div
      className={
        scanProfile === "barcode" ? "stack scanner-wrap--barcode" : "stack"
      }
    >
      <div className="muted">{title}</div>
      <div className="muted" style={{ fontSize: "0.88rem", lineHeight: 1.45 }}>
        {globalThis.BarcodeDetector
          ? "Modo nativo (Chrome/Edge): acerque el código; al leerlo se rellena el campo."
          : "Modo ZXing: buena luz, código nítido y horizontal si es de barras."}
      </div>
      <div className="scanner-box--video">
        <video
          ref={videoRef}
          className="scanner-video"
          muted
          playsInline
          autoPlay
        />
      </div>
      {running && (
        <div className="muted">
          Escaneando… mantenga el código centrado y enfocado.
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

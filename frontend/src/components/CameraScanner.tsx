import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";

type ScanProfile = "barcode" | "general";

type Props = {
  title: string;
  onScan: (text: string) => void;
  /** Cierra el modo cámara (p. ej. setCamX(false)). */
  onClose: () => void;
  active: boolean;
  scanProfile?: ScanProfile;
};

function normalizeScannedText(raw: string): string {
  return (raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

/**
 * Formatos nativos (kebab-case): menos formatos = menos trabajo por frame y lectura más rápida.
 * Se amplía solo lo habitual en inventario / GS1.
 */
const NATIVE_FORMATS_BARCODE = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "data_matrix",
  "qr_code",
  "pdf417",
] as const;

const NATIVE_FORMATS_GENERAL = [
  "qr_code",
  "data_matrix",
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "pdf417",
  "aztec",
] as const;

/** Formatos ZXing por perfil (acelera mucho frente a “todos los formatos”). */
const ZXING_FORMATS_BARCODE: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.PDF_417,
];

const ZXING_FORMATS_GENERAL: BarcodeFormat[] = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
];

/** Prioriza cámara trasera por etiqueta (tras permiso suelen venir nombres). */
function pickRearVideoTrackConstraints(
  devices: MediaDeviceInfo[],
): MediaTrackConstraints {
  if (devices.length === 0) {
    return { facingMode: { ideal: "environment" } };
  }
  if (devices.length === 1) {
    return { deviceId: { ideal: devices[0].deviceId } };
  }
  const back = devices.find((d) =>
    /back|rear|environment|trasera|wide|world/i.test(d.label),
  );
  if (back) {
    return { deviceId: { ideal: back.deviceId } };
  }
  const notFront = devices.find(
    (d) =>
      !/front|user|selfie|face|personal|facetime|ir\b|infrared|depth|3d/i.test(
        d.label,
      ),
  );
  if (notFront) {
    return { deviceId: { ideal: notFront.deviceId } };
  }
  const notIr = devices.find((d) => !/ir\b|infrared|depth|3d/i.test(d.label));
  return { deviceId: { ideal: (notIr ?? devices[devices.length - 1]).deviceId } };
}

async function acquireRearCameraStream(): Promise<MediaStream> {
  /* 720p–1080p suele ser el mejor equilibrio velocidad/precisión en móvil. */
  const videoBase: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  };

  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: { ...videoBase, facingMode: { ideal: "environment" } },
    },
    { audio: false, video: { ...videoBase, facingMode: "environment" } },
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: { facingMode: "environment" } },
  ];

  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch {
      /* siguiente estrategia */
    }
  }

  let devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "videoinput",
  );

  if (devices.length && devices.every((d) => !d.label)) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      tmp.getTracks().forEach((t) => t.stop());
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
    } catch {
      /* seguir con la lista que haya */
    }
  }

  const vt = pickRearVideoTrackConstraints(devices);
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...videoBase, ...vt },
    });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: vt,
      });
    } catch {
      /* Último recurso (p. ej. portátil sin trasera): frontal. */
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...videoBase, facingMode: "user" },
      });
    }
  }
}

/** Bitmap más pequeño: BarcodeDetector suele ir más rápido que sobre el vídeo a resolución completa. */
function drawVideoFrameForScan(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  maxWidth: number,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw < 8 || vh < 8) return;
  const scale = Math.min(1, maxWidth / vw);
  const tw = Math.max(1, Math.floor(vw * scale));
  const th = Math.max(1, Math.floor(vh * scale));
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw;
    canvas.height = th;
  }
  ctx.drawImage(video, 0, 0, tw, th);
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
  onClose,
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);

  useLayoutEffect(() => {
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
        let stream: MediaStream;
        try {
          stream = await acquireRearCameraStream();
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
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
          const scanCanvas = document.createElement("canvas");
          const scanCtx = scanCanvas.getContext("2d", {
            alpha: false,
            willReadFrequently: true,
          });
          if (!scanCtx) {
            releaseStream();
            setError("No se pudo preparar el escáner (canvas).");
            return;
          }
          const maxBitmapW = scanProfile === "barcode" ? 1280 : 960;
          const intervalMs = scanProfile === "barcode" ? 33 : 45;
          let busy = false;
          const timer = window.setInterval(() => {
            if (cancelled || busy) return;
            if (video.readyState < 2 || video.videoWidth < 8) return;
            busy = true;
            void (async () => {
              try {
                drawVideoFrameForScan(video, scanCanvas, scanCtx, maxBitmapW);
                if (scanCanvas.width < 4 || scanCanvas.height < 4) return;
                const codes = await detector.detect(scanCanvas);
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
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          scanProfile === "barcode"
            ? ZXING_FORMATS_BARCODE
            : ZXING_FORMATS_GENERAL,
        );

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 16,
          delayBetweenScanSuccess: 180,
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

  const overlay = (
    <div
      className="scanner-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="scanner-fullscreen__video-wrap">
        <video
          ref={videoRef}
          className="scanner-fullscreen__video"
          muted
          playsInline
          autoPlay
        />
        <div className="scanner-fullscreen__overlay">
          <button
            type="button"
            className="scanner-fullscreen__close"
            onClick={() => {
              try {
                stopRef.current?.();
              } catch {
                /* ignore */
              }
              stopRef.current = null;
              const v = videoRef.current;
              if (v?.srcObject) {
                (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
                v.srcObject = null;
              }
              setRunning(false);
              onClose();
            }}
          >
            Cerrar cámara
          </button>
          <p className="scanner-fullscreen__title">{title}</p>
          <p className="scanner-fullscreen__hint">
            {globalThis.BarcodeDetector
              ? "Acerque el código; al leerlo se cierra la cámara."
              : "Buena luz y código nítido; al detectarlo se cierra la cámara."}
          </p>
          {running && (
            <p className="scanner-fullscreen__status">Escaneando…</p>
          )}
          {error && <div className="scanner-fullscreen__error">{error}</div>}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

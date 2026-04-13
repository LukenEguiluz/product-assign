type ScanKind = "product" | "rfid" | "dlv";

const copy: Record<
  ScanKind,
  { offTitle: string; onTitle: string; hint: string }
> = {
  product: {
    offTitle: "Escanear con cámara",
    onTitle: "Cerrar cámara",
    hint: "Código de barras o DataMatrix",
  },
  rfid: {
    offTitle: "Escanear RFID con cámara",
    onTitle: "Cerrar cámara",
    hint: "Apunte al código RFID (24 hex)",
  },
  dlv: {
    offTitle: "Escanear DLV con cámara",
    onTitle: "Cerrar cámara",
    hint: "Código de barras del delivery",
  },
};

function CameraGlyph() {
  return (
    <svg
      className="scan-camera-btn__glyph"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

type Props = {
  active: boolean;
  onToggle: () => void;
  scanKind: ScanKind;
};

/**
 * Botón grande y muy visible para abrir/cerrar el escáner por cámara (móvil).
 */
export default function ScanCameraButton({ active, onToggle, scanKind }: Props) {
  const c = copy[scanKind];
  return (
    <div className="scan-camera-cta">
      <button
        type="button"
        className={
          active ? "scan-camera-btn scan-camera-btn--stop" : "scan-camera-btn"
        }
        onClick={onToggle}
        aria-pressed={active}
      >
        <span className="scan-camera-btn__row">
          <CameraGlyph />
          <span className="scan-camera-btn__titles">
            <span className="scan-camera-btn__main">
              {active ? c.onTitle : c.offTitle}
            </span>
            {!active && <span className="scan-camera-btn__hint">{c.hint}</span>}
          </span>
        </span>
      </button>
    </div>
  );
}

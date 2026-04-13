import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import * as api from "@/api/client";
import type { InventorySession, SessionScan } from "@/api/types";
import CameraScanner from "@/components/CameraScanner";
import ScanCameraButton from "@/components/ScanCameraButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  gtinLookupVariants,
  isYymmddStrictlyBeforeToday,
  needsGs1Review,
  parseGs1HealthcareScan,
  type Gs1ParseResult,
} from "@/utils/gs1Parse";

type Step = "gtin" | "rfid";

function normalizeRfid(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return hex.length === 24 ? hex : null;
}

function isScanExcluded(s: SessionScan): boolean {
  return Boolean(s.excluded_at);
}

/** Misma regla que el backend: RFID ya usado en una línea activa de la sesión. */
function isRfidActiveDupInSession(sess: InventorySession, hex24: string): boolean {
  const h = hex24.toUpperCase();
  for (const s of sess.scans ?? []) {
    if (!isScanExcluded(s) && s.rfid_hex.toUpperCase() === h) return true;
  }
  return false;
}

function formatYymmddHint(yymmdd: string | null | undefined): string {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return "";
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  return `→ 20${yy}-${mm}-${dd} (interpretación AAMMDD)`;
}

export default function SessionScanPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const sessionId = Number(id);

  const [session, setSession] = useState<InventorySession | null>(null);
  const [step, setStep] = useState<Step>("gtin");
  const [gtin, setGtin] = useState("");
  const [rfid, setRfid] = useState("");
  const [camGtin, setCamGtin] = useState(false);
  const [camRfid, setCamRfid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unknownOpen, setUnknownOpen] = useState(false);
  const [unknownCode, setUnknownCode] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [dupOpen, setDupOpen] = useState(false);

  const [pendingExpiryYymmdd, setPendingExpiryYymmdd] = useState<string | null>(null);
  const [pendingBatchLot, setPendingBatchLot] = useState("");
  const [productReadOpen, setProductReadOpen] = useState(false);
  const [readRawBarcode, setReadRawBarcode] = useState("");
  const [readFieldGtin, setReadFieldGtin] = useState("");
  const [readFieldExpiry, setReadFieldExpiry] = useState("");
  const [readFieldLot, setReadFieldLot] = useState("");
  const [readFieldErr, setReadFieldErr] = useState<string | null>(null);

  const [editingScan, setEditingScan] = useState<SessionScan | null>(null);
  const [editGtin, setEditGtin] = useState("");
  const [editRfid, setEditRfid] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [editLot, setEditLot] = useState("");
  const [scanRowBusyId, setScanRowBusyId] = useState<number | null>(null);

  /** Tras fallo al guardar o RFID duplicado, no volver a auto‑enviar hasta que cambien GTIN/RFID o el paso. */
  const skipAutoSubmitAfterErrorRef = useRef(false);

  type AppConfirmConfig = {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => Promise<void>;
    /** Si el usuario cancela (p. ej. abrir el modal de revisión del código GS1). */
    onCancelExtra?: () => void;
  };
  const [appConfirm, setAppConfirm] = useState<AppConfirmConfig | null>(null);
  const [appConfirmBusy, setAppConfirmBusy] = useState(false);

  const [finalInventoryTab, setFinalInventoryTab] = useState<"lines" | "by_reference">("lines");

  const scans = session?.scans;
  const activeScans = useMemo(
    () => (scans ?? []).filter((s) => !isScanExcluded(s)),
    [scans],
  );
  const excludedScans = useMemo(
    () => (scans ?? []).filter((s) => isScanExcluded(s)),
    [scans],
  );
  const totalScanCount = scans?.length ?? 0;
  const refCountRows = useMemo(() => {
    const map = new Map<string, { reference: string; description: string; count: number }>();
    for (const s of activeScans) {
      const ref = (s.reference ?? "").trim();
      const key = ref ? `ref:${ref}` : `gtin:${s.gtin}`;
      const desc = (s.description ?? "").trim();
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
        if (!cur.description && desc) cur.description = desc;
      } else {
        map.set(key, {
          reference: ref || `(sin referencia en catálogo · GTIN ${s.gtin})`,
          description: desc || "—",
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.reference.localeCompare(b.reference, "es", { sensitivity: "base" }),
    );
  }, [activeScans]);

  const load = useCallback(async () => {
    const s = await api.getSession(sessionId);
    setSession(s);
  }, [sessionId]);

  useEffect(() => {
    if (!Number.isFinite(sessionId)) {
      nav("/");
      return;
    }
    void load().catch(() => nav("/"));
  }, [sessionId, nav, load]);

  async function tryCatalogAndAdvance(
    gtinGuess: string,
    expiry: string | null,
    lot: string,
  ) {
    setBusy(true);
    try {
      const g0 = (gtinGuess || "").trim().toUpperCase();
      if (!g0) {
        setReadFieldErr("Indique un GTIN.");
        return;
      }
      const expTrim = (expiry || "").trim();
      const expClean =
        expTrim.length === 6 && /^\d{6}$/.test(expTrim) ? expTrim : null;
      if (expTrim && !expClean) {
        setReadFieldErr("La caducidad debe ser 6 dígitos AAMMDD o déjela vacía.");
        return;
      }
      const lotClean = (lot || "").trim().slice(0, 64);
      const variants = gtinLookupVariants(g0);
      for (const v of variants) {
        try {
          const look = await api.catalogLookup(v);
          if (look.exists && look.item) {
            setPendingExpiryYymmdd(expClean);
            setPendingBatchLot(lotClean);
            setGtin(look.item.gtin);
            setProductReadOpen(false);
            setUnknownOpen(false);
            setReadFieldErr(null);
            setError(null);
            setStep("rfid");
            return;
          }
        } catch {
          /* probar siguiente variante */
        }
      }
      setPendingExpiryYymmdd(expClean);
      setPendingBatchLot(lotClean);
      setUnknownCode(g0);
      setProductReadOpen(false);
      setUnknownOpen(true);
      setReadFieldErr(null);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Si el GTIN está en catálogo y hay lote leído: avanza al RFID sin modal.
   * Si además hay caducidad anterior a hoy: pide confirmación antes.
   */
  async function tryAutoAdvanceIfEligible(
    parsed: Gs1ParseResult,
    rawT: string,
  ): Promise<boolean> {
    const gGuess = (parsed.gtin ?? rawT).trim().toUpperCase();
    const lot = (parsed.lot ?? "").trim();
    if (!gGuess || !lot) return false;

    let inCatalog = false;
    for (const v of gtinLookupVariants(gGuess)) {
      try {
        const look = await api.catalogLookup(v);
        if (look.exists && look.item) {
          inCatalog = true;
          break;
        }
      } catch {
        /* siguiente variante */
      }
    }
    if (!inCatalog) return false;

    const exp = (parsed.expiryYymmdd ?? "").trim();
    if (exp && !/^\d{6}$/.test(exp)) return false;

    if (exp && isYymmddStrictlyBeforeToday(exp)) {
      setAppConfirm({
        title: "Caducidad anterior a hoy",
        message: `La caducidad ${exp} es anterior a la fecha actual. ¿Desea continuar con esta fecha y el lote «${lot}» y pasar a leer el RFID?`,
        confirmLabel: "Sí, continuar",
        cancelLabel: "Revisar código",
        onCancelExtra: () => setProductReadOpen(true),
        onConfirm: async () => {
          await tryCatalogAndAdvance(gGuess, exp, lot);
        },
      });
      return true;
    }

    await tryCatalogAndAdvance(gGuess, exp || null, lot);
    return true;
  }

  function openProductReadFromCapture(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setError(null);
    setReadFieldErr(null);
    const parsed = parseGs1HealthcareScan(t);
    setReadRawBarcode(t);
    setReadFieldGtin(parsed.gtin ?? "");
    setReadFieldExpiry(parsed.expiryYymmdd ?? "");
    setReadFieldLot(parsed.lot ?? "");
    setCamGtin(false);

    if (!needsGs1Review(parsed, t)) {
      void tryCatalogAndAdvance(
        parsed.gtin ?? t,
        parsed.expiryYymmdd,
        parsed.lot ?? "",
      );
      return;
    }

    void (async () => {
      const handled = await tryAutoAdvanceIfEligible(parsed, t);
      if (!handled) setProductReadOpen(true);
    })();
  }

  function onGtinScan(text: string) {
    openProductReadFromCapture(text);
  }

  const onRfidScan = useCallback((text: string) => {
    const h = normalizeRfid(text);
    if (!h) {
      setError("El RFID debe tener 24 caracteres hexadecimales.");
      return;
    }
    setRfid(h);
    setCamRfid(false);
  }, []);

  async function confirmAddCatalog() {
    if (!newRef.trim()) {
      setError("La referencia es obligatoria.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const item = await api.createCatalogItem({
        gtin: unknownCode,
        reference: newRef.trim(),
        description: newDesc.trim(),
      });
      setUnknownOpen(false);
      setStep("rfid");
      setGtin(item.gtin);
    } catch {
      setError("No se pudo guardar en el catálogo.");
    } finally {
      setBusy(false);
    }
  }

  const submitPair = useCallback(async () => {
    if (!session) return;
    const g = gtin.trim();
    const h = normalizeRfid(rfid);
    if (!g) {
      setError("Indique el GTIN.");
      return;
    }
    if (!h) {
      setError("Indique el RFID (24 hex).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addScan(session.id, {
        gtin: g,
        rfid_hex: h,
        ...(pendingExpiryYymmdd ? { expiry_yymmdd: pendingExpiryYymmdd } : {}),
        ...(pendingBatchLot ? { batch_lot: pendingBatchLot } : {}),
      });
      setGtin("");
      setRfid("");
      setPendingExpiryYymmdd(null);
      setPendingBatchLot("");
      setStep("gtin");
      await load();
    } catch (e) {
      const data = isAxiosError(e) ? e.response?.data : undefined;
      if (data && typeof data === "object" && "rfid_hex" in data) {
        setDupOpen(true);
      } else {
        setError("No se pudo guardar el par. Revise los datos.");
      }
      skipAutoSubmitAfterErrorRef.current = true;
    } finally {
      setBusy(false);
    }
  }, [session, gtin, rfid, pendingExpiryYymmdd, pendingBatchLot, load]);

  useEffect(() => {
    skipAutoSubmitAfterErrorRef.current = false;
  }, [rfid, gtin, step]);

  /** Si el RFID es hex 24 válido y no duplicado en líneas activas, guarda el par sin pulsar el botón. */
  useEffect(() => {
    if (!session || session.status === "completed" || step !== "rfid" || busy) return;
    if (skipAutoSubmitAfterErrorRef.current) return;
    const g = gtin.trim();
    const h = normalizeRfid(rfid);
    if (!g || !h) return;
    if (isRfidActiveDupInSession(session, h)) {
      setDupOpen(true);
      skipAutoSubmitAfterErrorRef.current = true;
      return;
    }
    const tid = window.setTimeout(() => {
      void submitPair();
    }, 120);
    return () => window.clearTimeout(tid);
  }, [session, step, busy, gtin, rfid, submitPair]);

  async function pauseAndLeave() {
    if (!session) return;
    setBusy(true);
    try {
      await api.pauseSession(session.id);
      nav("/");
    } finally {
      setBusy(false);
    }
  }

  function openConfirmFinish() {
    if (!session) return;
    setAppConfirm({
      title: "Finalizar inventario",
      message:
        "¿Finalizar esta lectura? No podrá añadir más pares GTIN–RFID hasta que pulse «Reabrir inventario».",
      confirmLabel: "Finalizar",
      cancelLabel: "Cancelar",
      onConfirm: async () => {
        if (!session) return;
        await api.completeSession(session.id);
        await load();
      },
    });
  }

  function openConfirmResume() {
    if (!session) return;
    setAppConfirm({
      title: "Reabrir inventario",
      message:
        "¿Reabrir esta lectura? Podrá seguir capturando pares GTIN–RFID. El estado pasará a pausado (borrador).",
      confirmLabel: "Reabrir",
      cancelLabel: "Cancelar",
      onConfirm: async () => {
        if (!session) return;
        setError(null);
        try {
          await api.resumeSession(session.id);
          await load();
        } catch {
          setError("No se pudo reabrir la lectura.");
        }
      },
    });
  }

  async function downloadExcel() {
    if (!session) return;
    await api.downloadSessionExcel(session.id);
  }

  function openEditScan(r: SessionScan) {
    setError(null);
    setEditingScan(r);
    setEditGtin(r.gtin);
    setEditRfid(r.rfid_hex);
    setEditExpiry(r.expiry_yymmdd ?? "");
    setEditLot(r.batch_lot ?? "");
  }

  function closeEditScan() {
    setEditingScan(null);
  }

  async function saveEditScan(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !editingScan) return;
    const g = editGtin.trim();
    const h = normalizeRfid(editRfid);
    if (!g) {
      setError("Indique el GTIN.");
      return;
    }
    if (!h) {
      setError("Indique el RFID (24 hex).");
      return;
    }
    const ex = editExpiry.trim();
    if (ex && !/^\d{6}$/.test(ex)) {
      setError("Caducidad: 6 dígitos AAMMDD o vacío.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patchSessionScan(session.id, editingScan.id, {
        gtin: g,
        rfid_hex: h,
        expiry_yymmdd: ex ? ex : null,
        batch_lot: editLot.trim(),
      });
      closeEditScan();
      await load();
    } catch (err) {
      const data = isAxiosError(err) ? err.response?.data : undefined;
      if (data && typeof data === "object" && "rfid_hex" in data) {
        setError(
          String(
            (data as { rfid_hex?: string[] }).rfid_hex?.[0] ??
              "Conflicto con otro RFID activo.",
          ),
        );
      } else {
        setError("No se pudo guardar la edición.");
      }
    } finally {
      setBusy(false);
    }
  }

  function openConfirmExcludeScan(r: SessionScan) {
    if (!session) return;
    setAppConfirm({
      title: "Quitar del inventario final",
      message:
        "¿Quitar esta línea del inventario final? Seguirá en el historial y podrá restaurarla más tarde.",
      confirmLabel: "Quitar",
      cancelLabel: "No",
      onConfirm: async () => {
        if (!session) return;
        setScanRowBusyId(r.id);
        setError(null);
        try {
          await api.excludeSessionScan(session.id, r.id);
          await load();
        } catch {
          setError("No se pudo excluir la línea.");
        } finally {
          setScanRowBusyId(null);
        }
      },
    });
  }

  async function restoreScan(r: SessionScan) {
    if (!session) return;
    setScanRowBusyId(r.id);
    setError(null);
    try {
      await api.restoreSessionScan(session.id, r.id);
      await load();
    } catch (e) {
      const data = isAxiosError(e) ? e.response?.data : undefined;
      if (data && typeof data === "object" && "detail" in data) {
        setError(String((data as { detail: string }).detail));
      } else {
        setError("No se pudo restaurar la línea.");
      }
    } finally {
      setScanRowBusyId(null);
    }
  }

  if (!session) {
    return (
      <div className="layout">
        <p className="muted">Cargando sesión…</p>
      </div>
    );
  }

  const readOnlyCapture = session.status === "completed";
  const statusText =
    session.status === "draft"
      ? "Pausada"
      : session.status === "in_progress"
        ? "En progreso"
        : "Finalizada";

  return (
    <div className="layout">
      <Link to="/" className="link-back">
        ← Historial
      </Link>

      <div className="card stack">
        <div>
          <h1>Lectura #{session.id}</h1>
          <span className="badge">{statusText}</span>
        </div>
        <dl className="meta-list">
          <dt>Cliente</dt>
          <dd>{session.client_name}</dd>
          <dt>DLV</dt>
          <dd>{session.delivery_number}</dd>
          <dt>Fecha inventario</dt>
          <dd>{session.inventory_date}</dd>
        </dl>
        {readOnlyCapture && (
          <p className="muted" style={{ margin: 0 }}>
            Lectura finalizada. Puede corregir líneas, quitarlas del inventario final (siguen en
            historial) o reabrir para seguir capturando. El Excel solo incluye líneas activas.
          </p>
        )}
        {!readOnlyCapture && (
          <div className="actions-grid">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void pauseAndLeave()}
            >
              Salir y continuar después
            </button>
            <button type="button" disabled={busy} onClick={openConfirmFinish}>
              Finalizar inventario
            </button>
          </div>
        )}
        {readOnlyCapture && (
          <div className="actions-grid">
            <button
              type="button"
              className="btn btn--accent btn--block"
              disabled={busy}
              onClick={openConfirmResume}
            >
              Reabrir inventario
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--block"
              onClick={() => void downloadExcel()}
            >
              Descargar Excel
            </button>
          </div>
        )}
      </div>

      {!readOnlyCapture && (
        <div className="card stack">
          <h2>
            {step === "gtin"
              ? "1. Código de producto (GTIN / GUDID)"
              : "2. RFID (24 hex)"}
          </h2>

          {step === "gtin" && (
            <>
              <ScanCameraButton
                active={camGtin}
                onToggle={() => setCamGtin((v) => !v)}
                scanKind="product"
              />
              <label>
                Código de producto (GTIN, EAN o bloque GS1 / DataMatrix)
                <input
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  placeholder="Ej. 0108714729827658172706201036802520"
                  autoCapitalize="characters"
                />
              </label>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                Si el lector devuelve un bloque largo, se interpretan los campos (01) GTIN, (17)
                caducidad AAMMDD y (10) lote. Si falta fecha o lote, complételos a mano en el
                siguiente paso.
              </p>
              <div className="actions-grid">
                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  disabled={!gtin.trim()}
                  onClick={() => openProductReadFromCapture(gtin)}
                >
                  Validar código manual
                </button>
              </div>
              {camGtin && (
                <CameraScanner
                  scanProfile="barcode"
                  title="Apunte al código de barras o matriz de datos del producto"
                  active={camGtin}
                  onScan={onGtinScan}
                />
              )}
            </>
          )}

          {step === "rfid" && (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Producto: <code>{gtin}</code>
              </p>
              {(pendingExpiryYymmdd || pendingBatchLot) && (
                <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
                  {pendingExpiryYymmdd ? (
                    <>
                      Caducidad (YYMMDD): <code>{pendingExpiryYymmdd}</code>
                      {formatYymmddHint(pendingExpiryYymmdd)
                        ? ` ${formatYymmddHint(pendingExpiryYymmdd)}`
                        : ""}
                      <br />
                    </>
                  ) : null}
                  {pendingBatchLot ? (
                    <>
                      Lote: <code>{pendingBatchLot}</code>
                    </>
                  ) : null}
                </p>
              )}
              <ScanCameraButton
                active={camRfid}
                onToggle={() => setCamRfid((v) => !v)}
                scanKind="rfid"
              />
              <label>
                RFID hexadecimal (24 caracteres)
                <input
                  value={rfid}
                  onChange={(e) => setRfid(e.target.value.toUpperCase())}
                  maxLength={32}
                  placeholder="24 caracteres 0-9 A-F"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                Si el código tiene 24 caracteres hexadecimales válidos y no está ya en una línea
                activa de esta lectura, el par se guarda solo (también puede usar «Guardar par»).
              </p>
              <div className="actions-grid">
                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  onClick={() => {
                    setPendingExpiryYymmdd(null);
                    setPendingBatchLot("");
                    setStep("gtin");
                  }}
                >
                  Otro producto
                </button>
                <button
                  type="button"
                  className="btn btn--block"
                  disabled={busy}
                  onClick={() => void submitPair()}
                >
                  Guardar par
                </button>
              </div>
              {camRfid && (
                <CameraScanner
                  scanProfile="general"
                  title="Apunte al código del RFID (hex 24)"
                  active={camRfid}
                  onScan={onRfidScan}
                />
              )}
            </>
          )}

          {error && <div className="error">{error}</div>}
        </div>
      )}

      {readOnlyCapture && (
        <div className="card stack muted" style={{ fontSize: "0.95rem" }}>
          <p style={{ margin: 0 }}>
            Para capturar nuevos pares, pulse <strong>Reabrir inventario</strong> arriba.
          </p>
        </div>
      )}

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Líneas del inventario final</h2>
        <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
          Las líneas excluidas no cuentan en el total ni en el Excel; permanecen como historial y
          se pueden restaurar. El último escaneo aparece arriba; el primero de la sesión, abajo.
        </p>
        <div className="inventory-final-tabs" role="tablist" aria-label="Vista del inventario final">
          <button
            type="button"
            role="tab"
            aria-selected={finalInventoryTab === "lines"}
            className={
              finalInventoryTab === "lines"
                ? "inventory-final-tabs__btn inventory-final-tabs__btn--active"
                : "inventory-final-tabs__btn"
            }
            onClick={() => setFinalInventoryTab("lines")}
          >
            Líneas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={finalInventoryTab === "by_reference"}
            className={
              finalInventoryTab === "by_reference"
                ? "inventory-final-tabs__btn inventory-final-tabs__btn--active"
                : "inventory-final-tabs__btn"
            }
            onClick={() => setFinalInventoryTab("by_reference")}
          >
            Conteo por referencia
          </button>
        </div>

        {finalInventoryTab === "lines" && (
          <div className="scan-list" role="tabpanel">
            {activeScans.map((r, i) => (
              <article key={r.id} className="scan-line">
                <div className="scan-line__product">
                  <div className="scan-line__reference">
                    {(r.reference ?? "").trim() || "Sin referencia en catálogo"}
                  </div>
                  <div className="scan-line__description">
                    {(r.description ?? "").trim() || "Sin descripción en catálogo"}
                  </div>
                </div>
                <div className="scan-line__row">
                  <span>#{activeScans.length - i}</span>
                  <span>{r.created_by_username}</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="scan-line__codes">
                  <strong>GTIN</strong> <code>{r.gtin}</code>
                  <br />
                  <strong>RFID</strong> <code>{r.rfid_hex}</code>
                  {(r.expiry_yymmdd || r.batch_lot) && (
                    <>
                      <br />
                      {r.expiry_yymmdd ? (
                        <>
                          <strong>Cad.</strong> <code>{r.expiry_yymmdd}</code>
                          {formatYymmddHint(r.expiry_yymmdd)
                            ? ` ${formatYymmddHint(r.expiry_yymmdd)}`
                            : ""}{" "}
                        </>
                      ) : null}
                      {r.batch_lot ? (
                        <>
                          <strong>Lote</strong> <code>{r.batch_lot}</code>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="scan-line__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={scanRowBusyId !== null}
                    onClick={() => openEditScan(r)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={scanRowBusyId !== null}
                    onClick={() => openConfirmExcludeScan(r)}
                  >
                    Quitar del final
                  </button>
                </div>
              </article>
            ))}
            {activeScans.length === 0 && totalScanCount > 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Todas las líneas están excluidas del inventario final, o aún no hay activas.
                Restaure desde el historial o reabra para capturar más.
              </p>
            )}
            {totalScanCount === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Sin registros aún.
              </p>
            )}
          </div>
        )}

        {finalInventoryTab === "by_reference" && (
          <div className="ref-count-panel" role="tabpanel">
            <p className="muted" style={{ margin: "0 0 0.65rem", fontSize: "0.88rem" }}>
              Total de líneas activas en el inventario final:{" "}
              <strong>{activeScans.length}</strong>
            </p>
            {refCountRows.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {totalScanCount === 0
                  ? "Sin registros aún."
                  : "No hay líneas activas para agrupar."}
              </p>
            ) : (
              <ul className="ref-count-list">
                {refCountRows.map((row, idx) => (
                  <li key={`${idx}-${row.reference}`} className="ref-count-list__item">
                    <div className="ref-count-list__count" aria-label="Cantidad">
                      {row.count}
                    </div>
                    <div className="ref-count-list__text">
                      <div className="ref-count-list__reference">{row.reference}</div>
                      <div className="ref-count-list__description">{row.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {excludedScans.length > 0 && (
          <>
            <h3 style={{ margin: "1rem 0 0.35rem", fontSize: "1rem" }}>
              Historial (excluidas del inventario final)
            </h3>
            <div className="scan-list">
              {excludedScans.map((r) => (
                <article key={r.id} className="scan-line scan-line--excluded">
                  <div className="scan-line__row">
                    <span className="badge">Excluida</span>
                    <span>{r.created_by_username}</span>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {r.excluded_at && (
                    <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.82rem" }}>
                      Quitada el {new Date(r.excluded_at).toLocaleString()}
                      {r.excluded_by_username ? ` · ${r.excluded_by_username}` : ""}
                    </p>
                  )}
                  <div className="scan-line__codes">
                    <strong>GTIN</strong> <code>{r.gtin}</code>
                    <br />
                    <strong>RFID</strong> <code>{r.rfid_hex}</code>
                    {(r.expiry_yymmdd || r.batch_lot) && (
                      <>
                        <br />
                        {r.expiry_yymmdd ? (
                          <>
                            <strong>Cad.</strong> <code>{r.expiry_yymmdd}</code>
                            {formatYymmddHint(r.expiry_yymmdd)
                              ? ` ${formatYymmddHint(r.expiry_yymmdd)}`
                              : ""}{" "}
                          </>
                        ) : null}
                        {r.batch_lot ? (
                          <>
                            <strong>Lote</strong> <code>{r.batch_lot}</code>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="scan-line__actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={scanRowBusyId !== null}
                      onClick={() => void restoreScan(r)}
                    >
                      {scanRowBusyId === r.id ? "…" : "Restaurar al inventario final"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={scanRowBusyId !== null}
                      onClick={() => openEditScan(r)}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {error && readOnlyCapture && !editingScan && (
          <div className="error">{error}</div>
        )}
      </div>

      {appConfirm && (
        <ConfirmDialog
          open
          title={appConfirm.title}
          confirmLabel={appConfirm.confirmLabel}
          cancelLabel={appConfirm.cancelLabel}
          busy={appConfirmBusy}
          onCancel={() => {
            if (appConfirmBusy) return;
            appConfirm.onCancelExtra?.();
            setAppConfirm(null);
          }}
          onConfirm={async () => {
            setAppConfirmBusy(true);
            try {
              await appConfirm.onConfirm();
            } finally {
              setAppConfirmBusy(false);
              setAppConfirm(null);
            }
          }}
        >
          <p className="muted" style={{ margin: 0 }}>
            {appConfirm.message}
          </p>
        </ConfirmDialog>
      )}

      {productReadOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-read-title"
          onClick={() => {
            setProductReadOpen(false);
            setGtin("");
          }}
        >
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h3 id="product-read-title">Confirmar lectura del código</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
              Revise el GTIN (01), la caducidad (17, 6 dígitos AAMMDD) y el lote (10). Si el
              lector no separó bien los campos, corríjalos a mano o pulse «Volver a leer».
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Lectura cruda:
            </p>
            <code
              style={{
                display: "block",
                wordBreak: "break-all",
                fontSize: "0.82rem",
                padding: "0.35rem 0.5rem",
                background: "var(--color-bg-elevated)",
                borderRadius: 6,
              }}
            >
              {readRawBarcode}
            </code>
            <label>
              GTIN
              <input
                value={readFieldGtin}
                onChange={(e) => setReadFieldGtin(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              Caducidad AAMMDD (opcional, 6 dígitos)
              <input
                value={readFieldExpiry}
                onChange={(e) =>
                  setReadFieldExpiry(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                maxLength={6}
                placeholder="p. ej. 270620"
                autoComplete="off"
              />
            </label>
            {readFieldExpiry.length === 6 && (
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                {formatYymmddHint(readFieldExpiry)}
              </p>
            )}
            <label>
              Lote (opcional)
              <input
                value={readFieldLot}
                onChange={(e) => setReadFieldLot(e.target.value)}
                maxLength={64}
                autoComplete="off"
              />
            </label>
            {readFieldErr && <div className="error">{readFieldErr}</div>}
            <div className="modal-actions modal-actions--row">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setProductReadOpen(false);
                  setGtin("");
                  setReadFieldErr(null);
                }}
              >
                Volver a leer
              </button>
              <button
                type="button"
                className="btn btn--accent"
                disabled={busy}
                onClick={() =>
                  void tryCatalogAndAdvance(
                    readFieldGtin,
                    readFieldExpiry,
                    readFieldLot,
                  )
                }
              >
                Buscar en catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {unknownOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal stack">
            <h3>Código no catalogado</h3>
            <p style={{ margin: 0 }}>
              El código <code>{unknownCode}</code> no está en el catálogo. ¿Es correcto y desea
              agregarlo?
            </p>
            <label>
              Referencia
              <input value={newRef} onChange={(e) => setNewRef(e.target.value)} />
            </label>
            <label>
              Descripción
              <textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </label>
            <div className="modal-actions modal-actions--row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setUnknownOpen(false);
                  setGtin("");
                  setPendingExpiryYymmdd(null);
                  setPendingBatchLot("");
                }}
              >
                Volver a escanear
              </button>
              <button type="button" disabled={busy} onClick={() => void confirmAddCatalog()}>
                Agregar al catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {dupOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal stack">
            <h3>RFID duplicado</h3>
            <p style={{ margin: 0 }}>
              Ese RFID ya existe en esta lectura. Revise el etiquetado o vuelva a capturar el
              código.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDupOpen(false);
                  setStep("gtin");
                  setGtin("");
                  setRfid("");
                  setPendingExpiryYymmdd(null);
                  setPendingBatchLot("");
                }}
              >
                Escanear otro producto
              </button>
              <button
                type="button"
                onClick={() => {
                  setDupOpen(false);
                  setRfid("");
                  setCamRfid(true);
                }}
              >
                Volver a leer RFID
              </button>
            </div>
          </div>
        </div>
      )}

      {editingScan && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-scan-title"
          onClick={closeEditScan}
        >
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h3 id="edit-scan-title">Editar línea</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
              Los cambios quedan registrados en el historial de la lectura.
            </p>
            <form className="stack" onSubmit={saveEditScan}>
              <label>
                GTIN
                <input
                  value={editGtin}
                  onChange={(e) => setEditGtin(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                RFID (24 hex)
                <input
                  value={editRfid}
                  onChange={(e) => setEditRfid(e.target.value.toUpperCase())}
                  maxLength={32}
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label>
                Caducidad AAMMDD (opcional)
                <input
                  value={editExpiry}
                  onChange={(e) =>
                    setEditExpiry(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="vacío o 6 dígitos"
                  autoComplete="off"
                />
              </label>
              <label>
                Lote (opcional)
                <input
                  value={editLot}
                  onChange={(e) => setEditLot(e.target.value)}
                  maxLength={64}
                  autoComplete="off"
                />
              </label>
              {error && <div className="error">{error}</div>}
              <div className="modal-actions modal-actions--row">
                <button type="button" className="btn btn--secondary" onClick={closeEditScan}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--accent" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

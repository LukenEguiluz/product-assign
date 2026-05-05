import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "@/api/client";
import type { Client } from "@/api/types";

export default function MinMaxPage() {
  const [consumo, setConsumo] = useState<File | null>(null);
  const [inventario, setInventario] = useState<File | null>(null);
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsErr, setClientsErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [meses, setMeses] = useState("6");
  const [fechaRef, setFechaRef] = useState("");
  const [leadTime, setLeadTime] = useState("7");
  const [periodo, setPeriodo] = useState("7");
  const [z, setZ] = useState("1.65");

  useEffect(() => {
    let alive = true;
    void (async () => {
      setClientsErr(null);
      try {
        const list = await api.listClients();
        if (alive) setClients(list);
      } catch {
        if (alive) setClientsErr("No se pudo cargar el listado de clientes.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const cid = parseInt(clientId, 10);
    if (!Number.isFinite(cid)) {
      setErr("Seleccione el cliente al que va dirigido el documento.");
      return;
    }
    if (!consumo || !inventario) {
      setErr("Seleccione ambos archivos .xlsx (consumos e inventario).");
      return;
    }
    setBusy(true);
    try {
      await api.downloadMinMaxExcel({
        clientId: cid,
        consumo,
        inventario,
        meses: meses.trim() || undefined,
        fecha_referencia: fechaRef.trim() || undefined,
        lead_time_dias: leadTime.trim() || undefined,
        periodo_reabastecimiento_dias: periodo.trim() || undefined,
        z_score: z.trim() || undefined,
      });
    } catch (ex: unknown) {
      let msg = "No se pudo generar el Excel. Revise los archivos y vuelva a intentar.";
      const ax = ex as { response?: { data?: unknown } };
      const body = ax.response?.data;
      if (body && typeof body === "object") {
        const o = body as { detail?: unknown };
        if (o.detail !== undefined) {
          msg =
            typeof o.detail === "string" ? o.detail : JSON.stringify(o.detail);
        }
      }
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <Link to="/" className="link-back">
        ← Inicio
      </Link>
      <header className="page-header" style={{ marginBottom: "1rem" }}>
        <div className="page-header__title">
          <h1>Stock mínimo / máximo</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Elija el cliente, suba el Excel de consumos y el de inventario. El
            archivo descargado se nombra con el cliente y la fecha de generación.
          </p>
        </div>
      </header>

      <div className="card stack">
        {clientsErr && <div className="error">{clientsErr}</div>}
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Cliente (dirigido a)
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">— Seleccione —</option>
              {clients.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.client_number})
                </option>
              ))}
            </select>
          </label>
          {clients.length === 0 && !clientsErr && (
            <p className="muted" style={{ margin: 0 }}>
              No hay clientes registrados.{" "}
              <Link to="/clientes">Cree uno en Clientes</Link>.
            </p>
          )}

          <label>
            Archivo de consumos (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setConsumo(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Archivo de inventario (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setInventario(e.target.files?.[0] ?? null)}
            />
          </label>

          <h2 className="section-title">Parámetros (opcional)</h2>
          <div className="form-inline">
            <label>
              Meses
              <input
                inputMode="numeric"
                value={meses}
                onChange={(e) => setMeses(e.target.value)}
                placeholder="6"
              />
            </label>
            <label>
              Fecha fin (YYYY-MM-DD)
              <input
                value={fechaRef}
                onChange={(e) => setFechaRef(e.target.value)}
                placeholder="(hoy)"
              />
            </label>
            <label>
              Lead time (días)
              <input
                inputMode="numeric"
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
                placeholder="7"
              />
            </label>
            <label>
              Periodo reabastecimiento (días)
              <input
                inputMode="numeric"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="7"
              />
            </label>
            <label>
              Z (nivel de servicio)
              <input
                value={z}
                onChange={(e) => setZ(e.target.value)}
                placeholder="1.65"
              />
            </label>
          </div>

          {err && <div className="error">{err}</div>}
          <button type="submit" className="btn btn--accent" disabled={busy}>
            {busy ? "Generando…" : "Generar y descargar Excel"}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "@/api/client";
import type { Client } from "@/api/types";
import CameraScanner from "@/components/CameraScanner";
import ScanCameraButton from "@/components/ScanCameraButton";

function todayISO() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function NewSessionPage() {
  const nav = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientNumber, setNewClientNumber] = useState("");
  const [deliveryNumber, setDeliveryNumber] = useState("");
  const [inventoryDate, setInventoryDate] = useState(todayISO());
  const [camDlv, setCamDlv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setClients(await api.listClients());
      } catch {
        setError("No se pudieron cargar los clientes.");
      }
    })();
  }, []);

  async function onCreateClient() {
    setError(null);
    setBusy(true);
    try {
      const c = await api.createClient({
        name: newClientName.trim(),
        client_number: newClientNumber.trim(),
      });
      setClients((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(c.id);
      setNewClientName("");
      setNewClientNumber("");
    } catch {
      setError("No se pudo crear el cliente (¿número duplicado?).");
    } finally {
      setBusy(false);
    }
  }

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Seleccione o cree un cliente.");
      return;
    }
    if (!deliveryNumber.trim()) {
      setError("Indique el número de delivery (DLV).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const session = await api.createSession({
        client: Number(clientId),
        delivery_number: deliveryNumber.trim(),
        inventory_date: inventoryDate,
      });
      await api.startSession(session.id);
      nav(`/lectura/${session.id}`);
    } catch {
      setError("No se pudo crear la sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <Link to="/" className="link-back">
        ← Volver al inicio
      </Link>
      <h1>Nueva lectura de inventario</h1>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Elija el cliente. Si no existe, créelo con nombre y número de cliente. Luego indique el
        DLV y la fecha del inventario.
      </p>

      <form className="card stack" onSubmit={onStart}>
        <h2 className="section-title section-title--first">Cliente</h2>
        <label>
          Cliente
          <select
            value={clientId === "" ? "" : String(clientId)}
            onChange={(e) =>
              setClientId(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">— Seleccione —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.client_number})
              </option>
            ))}
          </select>
        </label>

        <p className="muted" style={{ margin: 0 }}>
          Si no existe el cliente:
        </p>
        <div className="form-inline">
          <label>
            Nombre cliente
            <input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
            />
          </label>
          <label>
            Número de cliente
            <input
              inputMode="text"
              autoCapitalize="characters"
              value={newClientNumber}
              onChange={(e) => setNewClientNumber(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy || !newClientName.trim() || !newClientNumber.trim()}
            onClick={() => void onCreateClient()}
          >
            Guardar cliente
          </button>
        </div>

        <h2 className="section-title">Delivery y fecha</h2>
        <ScanCameraButton
          active={camDlv}
          onToggle={() => setCamDlv((v) => !v)}
          scanKind="dlv"
        />
        <label>
          DLV / número de delivery
          <input
            value={deliveryNumber}
            onChange={(e) => setDeliveryNumber(e.target.value)}
            placeholder="Manual o escaneado"
          />
        </label>
        {camDlv && (
          <CameraScanner
            scanProfile="barcode"
            title="Escanee el código de barras del delivery (DLV)"
            active={camDlv}
            onScan={(t) => {
              setDeliveryNumber(t);
              setCamDlv(false);
            }}
            onClose={() => setCamDlv(false)}
          />
        )}

        <label>
          Fecha del inventario
          <input
            type="date"
            value={inventoryDate}
            onChange={(e) => setInventoryDate(e.target.value)}
          />
        </label>

        {error && <div className="error">{error}</div>}
        <button type="submit" className="btn btn--block" disabled={busy}>
          {busy ? "Creando…" : "Crear evento e iniciar escaneo"}
        </button>
      </form>
    </div>
  );
}

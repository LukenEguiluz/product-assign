import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "@/api/client";
import type { Client } from "@/api/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [clientDraft, setClientDraft] = useState({ name: "", client_number: "" });
  const [savingClient, setSavingClient] = useState(false);

  const loadClients = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await api.listClients();
      setClients(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setError("No se pudieron cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  function startEditClient(c: Client) {
    setEditingClientId(c.id);
    setClientDraft({ name: c.name, client_number: c.client_number });
    setError(null);
  }

  function cancelEditClient() {
    setEditingClientId(null);
    setClientDraft({ name: "", client_number: "" });
  }

  async function saveClient() {
    if (editingClientId == null) return;
    if (!clientDraft.name.trim() || !clientDraft.client_number.trim()) {
      setError("Nombre y número de cliente son obligatorios.");
      return;
    }
    setSavingClient(true);
    setError(null);
    try {
      const updated = await api.updateClient(editingClientId, {
        name: clientDraft.name.trim(),
        client_number: clientDraft.client_number.trim(),
      });
      setClients((prev) =>
        prev
          .map((c) => (c.id === updated.id ? updated : c))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      cancelEditClient();
    } catch {
      setError("No se pudo guardar (¿número de cliente duplicado?).");
    } finally {
      setSavingClient(false);
    }
  }

  return (
    <div className="layout">
      <Link to="/" className="link-back">
        ← Inicio
      </Link>
      <h1>Clientes</h1>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Edite nombre y número de cliente.
      </p>

      <section className="card stack" aria-labelledby="clients-heading">
        <h2 id="clients-heading" style={{ margin: 0 }}>
          Listado
        </h2>
        {loading && <p className="muted">Cargando…</p>}
        {error && editingClientId === null && <div className="error">{error}</div>}
        {!loading && clients.length === 0 && (
          <p className="muted">No hay clientes. Cree uno desde «Nueva lectura».</p>
        )}
        <ul className="session-list">
          {clients.map((c) => (
            <li key={c.id} className="session-card">
              {editingClientId === c.id ? (
                <div className="stack">
                  <label>
                    Nombre
                    <input
                      value={clientDraft.name}
                      onChange={(e) =>
                        setClientDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Número de cliente
                    <input
                      value={clientDraft.client_number}
                      onChange={(e) =>
                        setClientDraft((d) => ({ ...d, client_number: e.target.value }))
                      }
                    />
                  </label>
                  {error && <div className="error">{error}</div>}
                  <div className="actions-grid">
                    <button
                      type="button"
                      className="secondary"
                      disabled={savingClient}
                      onClick={cancelEditClient}
                    >
                      Cancelar
                    </button>
                    <button type="button" disabled={savingClient} onClick={() => void saveClient()}>
                      {savingClient ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="session-card__dlv">{c.name}</div>
                  <div className="session-card__meta">
                    Número: <strong>{c.client_number}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--block"
                    onClick={() => startEditClient(c)}
                  >
                    Editar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

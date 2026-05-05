import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/api/client";
import type { InventorySession } from "@/api/types";

const statusLabel: Record<string, string> = {
  draft: "Pausada",
  in_progress: "En progreso",
  completed: "Finalizada",
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await api.listSessions({ mine: true });
        if (alive) setSessions(data);
      } catch {
        if (alive) setErr("No se pudo cargar el historial.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="layout">
      <header className="page-header">
        <div className="page-header__title">
          <h1>Lectura realizada</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Usuario: <strong>{user?.username}</strong>
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/catalogo" className="btn btn--secondary btn--sm">
            Catálogo
          </Link>
          <Link to="/clientes" className="btn btn--secondary btn--sm">
            Clientes
          </Link>
          {user?.can_create_app_users && (
            <Link to="/usuarios" className="btn btn--secondary btn--sm">
              Usuarios
            </Link>
          )}
          <button type="button" className="btn btn--secondary btn--sm" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <div className="card intro-card stack">
        <Link to="/nueva-lectura" className="btn btn--block">
          Nueva lectura
        </Link>
        <span className="muted">
          Asocie el código de barras (GTIN / GUDID) con el RFID hexadecimal (24
          caracteres).
        </span>
        <Link to="/min-max" className="btn btn--secondary btn--block">
          Stock mínimo / máximo
        </Link>
        <span className="muted">
          Genere un Excel de mínimos/máximos a partir de consumos + inventario.
        </span>
        <Link to="/catalogo" className="btn btn--secondary btn--block">
          Catálogo de productos
        </Link>
        <span className="muted">
          Consulte o cargue masivamente GTIN, referencia y descripción (Excel).
        </span>
      </div>

      <div className="card">
        <h2>Historial de lecturas</h2>
        {err && <div className="error">{err}</div>}
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.id} className="session-card">
              <div className="session-card__top">
                <span className="session-card__id">#{s.id}</span>
                <span className="badge">{statusLabel[s.status] ?? s.status}</span>
              </div>
              <div className="session-card__dlv">{s.delivery_number}</div>
              <div className="session-card__meta">
                Cliente: {s.client_name ?? "—"}
                <br />
                Fecha inventario: {s.inventory_date} · Ítems: {s.scan_count ?? "0"}
              </div>
              <Link
                to={`/lectura/${s.id}`}
                className="btn btn--accent btn--block"
              >
                Continuar lectura
              </Link>
            </li>
          ))}
          {sessions.length === 0 && !err && (
            <li className="muted" style={{ padding: "0.5rem 0" }}>
              No hay sesiones todavía.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

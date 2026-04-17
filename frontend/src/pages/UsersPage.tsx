import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/api/client";
import type { User } from "@/api/types";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function UsersPage() {
  const { user } = useAuth();
  const [list, setList] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pwTarget, setPwTarget] = useState<User | null>(null);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.can_create_app_users) return;
    void (async () => {
      try {
        setList(await api.listAppUsers());
      } catch {
        setErr("No se pudo cargar la lista de usuarios.");
      }
    })();
  }, [user]);

  if (!user?.can_create_app_users) {
    return <Navigate to="/" replace />;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      await api.createAppUser({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
      });
      setMsg("Usuario creado.");
      setUsername("");
      setPassword("");
      setEmail("");
      setList(await api.listAppUsers());
    } catch {
      setErr("No se pudo crear el usuario (¿nombre duplicado?).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <Link to="/" className="link-back">
        ← Inicio
      </Link>
      <h1>Usuarios de la aplicación</h1>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Solo los perfiles con permiso «Puede crear usuarios de la aplicación» (asignado por el
        superusuario en el admin de Django) ven esta pantalla.
        {user?.is_superuser ? (
          <> Como superusuario puede restablecer contraseñas desde la lista inferior.</>
        ) : null}
      </p>

      <form className="card stack" onSubmit={onCreate}>
        <h2 style={{ margin: 0 }}>Nuevo usuario</h2>
        <label>
          Usuario
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label>
          Correo (opcional)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {msg && <div className="success-banner">{msg}</div>}
        {err && <div className="error">{err}</div>}
        <button type="submit" className="btn btn--block" disabled={busy}>
          {busy ? "Guardando…" : "Crear usuario"}
        </button>
      </form>

      <div className="card">
        <h2>Usuarios existentes</h2>
        <div className="hide-md-up">
          {list.map((u) => (
            <div key={u.id} className="user-card">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <strong>{u.username}</strong>
                {user?.is_superuser ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => {
                      setPwErr(null);
                      setNewPw("");
                      setConfirmPw("");
                      setPwTarget(u);
                    }}
                  >
                    Cambiar contraseña
                  </button>
                ) : null}
              </div>
              <span className="muted">
                {u.email || "Sin correo"} · {u.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>
          ))}
        </div>
        <div className="table-wrap hide-sm">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Activo</th>
                {user?.is_superuser ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.email || "—"}</td>
                  <td>{u.is_active ? "Sí" : "No"}</td>
                  {user?.is_superuser ? (
                    <td>
                      <button
                        type="button"
                        className="btn btn--sm btn--secondary"
                        onClick={() => {
                          setPwErr(null);
                          setNewPw("");
                          setConfirmPw("");
                          setPwTarget(u);
                        }}
                      >
                        Cambiar contraseña
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={pwTarget !== null}
        title={pwTarget ? `Nueva contraseña: ${pwTarget.username}` : ""}
        confirmLabel="Guardar contraseña"
        cancelLabel="Cancelar"
        busy={pwBusy}
        onCancel={() => {
          if (pwBusy) return;
          setPwTarget(null);
          setPwErr(null);
          setNewPw("");
          setConfirmPw("");
        }}
        onConfirm={async () => {
          if (!pwTarget) return;
          setPwErr(null);
          if (newPw.length < 8) {
            setPwErr("La contraseña debe tener al menos 8 caracteres.");
            return;
          }
          if (newPw !== confirmPw) {
            setPwErr("Las contraseñas no coinciden.");
            return;
          }
          setPwBusy(true);
          try {
            await api.setAppUserPassword(pwTarget.id, {
              password: newPw,
              password_confirm: confirmPw,
            });
            setMsg(`Contraseña actualizada para «${pwTarget.username}».`);
            setPwTarget(null);
            setNewPw("");
            setConfirmPw("");
          } catch {
            setPwErr("No se pudo guardar la contraseña.");
          } finally {
            setPwBusy(false);
          }
        }}
      >
        <div className="stack" style={{ gap: "0.75rem" }}>
          <label>
            Nueva contraseña
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={pwBusy}
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              disabled={pwBusy}
            />
          </label>
          {pwErr ? <div className="error">{pwErr}</div> : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}

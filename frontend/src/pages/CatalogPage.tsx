import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "@/api/client";
import type { CatalogImportResult, CatalogItem } from "@/api/types";

type ListQuery = { page: number; q: string };

export default function CatalogPage() {
  const [listQuery, setListQuery] = useState<ListQuery>({ page: 1, q: "" });
  const [qInput, setQInput] = useState("");
  const [listNonce, setListNonce] = useState(0);
  const [listResp, setListResp] = useState<{
    count: number;
    results: CatalogItem[];
  } | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<CatalogImportResult | null>(
    null,
  );

  const [editTarget, setEditTarget] = useState<CatalogItem | null>(null);
  const [editRef, setEditRef] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const pageSize = 50;

  useEffect(() => {
    const t = setTimeout(() => {
      const next = qInput.trim();
      setListQuery((prev) => {
        if (prev.q === next) return prev;
        return { page: 1, q: next };
      });
    }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const bumpList = useCallback(() => {
    setListNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setListErr(null);
      try {
        const data = await api.listCatalog({
          page: listQuery.page,
          page_size: pageSize,
          q: listQuery.q || undefined,
        });
        if (alive) {
          setListResp({ count: data.count, results: data.results });
        }
      } catch {
        if (alive) {
          setListErr("No se pudo cargar el catálogo.");
          setListResp(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [listQuery.page, listQuery.q, listNonce]);

  function onBuscarClick() {
    const next = qInput.trim();
    setListQuery({ page: 1, q: next });
  }

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    setImportErr(null);
    setImportReport(null);
    if (!file) {
      setImportErr("Seleccione un archivo .xlsx.");
      return;
    }
    setImportBusy(true);
    try {
      const rep = await api.importCatalogExcel(file, updateExisting);
      setImportReport(rep);
      setFile(null);
      setListQuery((p) => ({ ...p, page: 1 }));
      bumpList();
    } catch (ex: unknown) {
      let msg = "No se pudo importar el archivo.";
      const ax = ex as { response?: { data?: unknown } };
      const body = ax.response?.data;
      if (body && typeof body === "object") {
        if ("created_count" in body) {
          setImportReport(body as CatalogImportResult);
        }
        const o = body as { error?: string; detail?: unknown };
        if (o.error) {
          msg = o.error;
        } else if (o.detail !== undefined) {
          msg =
            typeof o.detail === "string"
              ? o.detail
              : JSON.stringify(o.detail);
        }
      }
      setImportErr(msg);
    } finally {
      setImportBusy(false);
    }
  }

  function openEdit(row: CatalogItem) {
    setEditErr(null);
    setEditTarget(row);
    setEditRef(row.reference);
    setEditDesc(row.description ?? "");
  }

  function closeEdit() {
    setEditTarget(null);
    setEditErr(null);
    setEditBusy(false);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditErr(null);
    setEditBusy(true);
    try {
      await api.updateCatalogItem(editTarget.gtin, {
        reference: editRef.trim(),
        description: editDesc.trim(),
      });
      bumpList();
      closeEdit();
    } catch {
      setEditErr("No se pudo guardar. Revise los datos o su conexión.");
    } finally {
      setEditBusy(false);
    }
  }

  const totalPages = listResp
    ? Math.max(1, Math.ceil(listResp.count / pageSize))
    : 1;

  return (
    <div className="layout">
      <Link to="/" className="link-back">
        ← Inicio
      </Link>
      <header className="page-header" style={{ marginBottom: "1rem" }}>
        <div className="page-header__title">
          <h1>Catálogo de productos</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            GTIN, referencia y descripción se guardan siempre en mayúsculas.
          </p>
        </div>
      </header>

      <details className="card catalog-bulk-details" style={{ marginBottom: "1rem" }}>
        <summary className="catalog-bulk-details__summary">
          Carga masiva (Excel)
          <span className="catalog-bulk-details__hint muted">
            Pulse para desplegar el formulario
          </span>
        </summary>
        <div className="stack catalog-bulk-details__body">
          <p className="muted" style={{ margin: 0 }}>
            Primera fila: columnas <strong>GTIN</strong>, <strong>REFERENCIA</strong> y
            opcionalmente <strong>DESCRIPCION</strong>. Se detectan duplicados dentro del
            archivo y códigos que ya existen en el catálogo.
          </p>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => void api.downloadCatalogTemplate()}
          >
            Descargar plantilla .xlsx
          </button>
          <form className="stack" onSubmit={onImport}>
            <label>
              Archivo .xlsx
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                Actualizar referencia y descripción si el GTIN ya existe (sin crear
                duplicado).
              </span>
            </label>
            {importErr && <div className="error">{importErr}</div>}
            <button type="submit" className="btn btn--accent" disabled={importBusy}>
              {importBusy ? "Importando…" : "Importar"}
            </button>
          </form>

          {importReport && (
            <div className="stack" style={{ marginTop: "0.5rem" }}>
              {importReport.error && (
                <p className="muted" style={{ margin: 0 }}>
                  Revise el archivo y vuelva a intentar.
                </p>
              )}
              <p style={{ margin: 0 }}>
                <strong>Creados:</strong> {importReport.created_count} ·{" "}
                <strong>Actualizados:</strong> {importReport.updated_count} ·{" "}
                <strong>Omitidos por duplicado en archivo:</strong>{" "}
                {importReport.skipped_duplicate_in_file_rows}
              </p>
              {importReport.duplicates_in_file.length > 0 && (
                <div className="card" style={{ background: "var(--color-bg-elevated)" }}>
                  <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
                    Duplicados en el Excel (mismo GTIN en varias filas)
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {importReport.duplicates_in_file.map((d) => (
                      <li key={d.gtin}>
                        <code>{d.gtin}</code> — filas: {d.rows.join(", ")}
                      </li>
                    ))}
                  </ul>
                  <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                    Ninguna fila con esos GTIN se importó hasta corregir el archivo.
                  </p>
                </div>
              )}
              {importReport.already_in_catalog.length > 0 && (
                <div className="card" style={{ background: "var(--color-bg-elevated)" }}>
                  <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
                    Ya existían en el catálogo (no se crearon de nuevo)
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {importReport.already_in_catalog.map((r, i) => (
                      <li key={`${r.gtin}-${r.row}-${i}`}>
                        Fila {r.row}: <code>{r.gtin}</code> — en base:{" "}
                        <code>{r.existing_reference}</code>
                        {r.existing_description
                          ? ` — ${r.existing_description.slice(0, 80)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {importReport.invalid_rows.length > 0 && (
                <div className="card" style={{ background: "var(--color-bg-elevated)" }}>
                  <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
                    Filas con error
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {importReport.invalid_rows.map((r) => (
                      <li key={r.row}>
                        Fila {r.row}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Listado</h2>
        <div
          className="stack"
          style={{ marginBottom: "1rem", gap: "0.65rem" }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "flex-end",
            }}
          >
            <label style={{ flex: "1 1 200px", margin: 0 }}>
              Buscar
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="GTIN, referencia o descripción"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onBuscarClick}
            >
              Buscar
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            La búsqueda se aplica al dejar de escribir unos instantes o al pulsar «Buscar».
          </p>
        </div>
        {listErr && <div className="error">{listErr}</div>}
        {!listResp && !listErr && <p className="muted">Cargando…</p>}
        {listResp && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Total: {listResp.count} producto{listResp.count === 1 ? "" : "s"}
              {listQuery.q ? (
                <>
                  {" "}
                  (filtro: <code>{listQuery.q}</code>)
                </>
              ) : null}
            </p>
            <div
              className="catalog-mobile-list hide-md-up stack"
              style={{ gap: "0.65rem" }}
            >
              {listResp.results.map((row) => (
                <article key={row.id} className="card catalog-mobile-card stack">
                  <div className="catalog-mobile-card__field">
                    <span className="catalog-mobile-card__label">GTIN</span>
                    <code className="catalog-mobile-card__value">{row.gtin}</code>
                  </div>
                  <div className="catalog-mobile-card__field">
                    <span className="catalog-mobile-card__label">Referencia</span>
                    <code className="catalog-mobile-card__value">{row.reference}</code>
                  </div>
                  <div className="catalog-mobile-card__field">
                    <span className="catalog-mobile-card__label">Descripción</span>
                    <div className="catalog-mobile-card__value catalog-mobile-card__desc">
                      {row.description || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => openEdit(row)}
                  >
                    Editar
                  </button>
                </article>
              ))}
            </div>
            <div className="table-wrap hide-sm">
              <table>
                <thead>
                  <tr>
                    <th>GTIN</th>
                    <th>Referencia</th>
                    <th>Descripción</th>
                    <th style={{ width: "1%", whiteSpace: "nowrap" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {listResp.results.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <code>{row.gtin}</code>
                      </td>
                      <td>
                        <code>{row.reference}</code>
                      </td>
                      <td>{row.description || "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => openEdit(row)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listResp.results.length === 0 && (
              <p className="muted">No hay ítems en esta página.</p>
            )}
            <div
              className="row-actions"
              style={{
                marginTop: "1rem",
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={listQuery.page <= 1}
                onClick={() =>
                  setListQuery((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                }
              >
                Anterior
              </button>
              <span className="muted">
                Página {listQuery.page} de {totalPages}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={listQuery.page >= totalPages}
                onClick={() =>
                  setListQuery((p) => ({ ...p, page: p.page + 1 }))
                }
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>

      {editTarget && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalog-edit-title"
          onClick={closeEdit}
        >
          <div
            className="modal stack"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="catalog-edit-title" style={{ marginTop: 0 }}>
              Editar producto
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              GTIN (no editable): <code>{editTarget.gtin}</code>
            </p>
            <form className="stack" onSubmit={saveEdit}>
              <label>
                Referencia
                <input
                  value={editRef}
                  onChange={(e) => setEditRef(e.target.value)}
                  required
                  maxLength={255}
                  autoComplete="off"
                />
              </label>
              <label>
                Descripción
                <textarea
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </label>
              {editErr && <div className="error">{editErr}</div>}
              <div className="modal-actions modal-actions--row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={closeEdit}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--accent" disabled={editBusy}>
                  {editBusy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

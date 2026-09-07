import { useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";

import { formatDdmPair } from "./geo";
import { SPREADSHEET_ACCEPT, readSpreadsheetFile } from "./spreadsheetFile";
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  buildLines,
  guessRoles,
  parseTable,
  type ColumnRole,
  type ImportedLine,
  type ParsedTable,
} from "./tableImport";
import "./ImportDialog.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (lines: ImportedLine[], groupName?: string) => void;
};

/**
 * Paste-a-spreadsheet importer.
 *
 * Two steps: paste the rows, then confirm what each column means. The mapping
 * is auto-guessed from the header, so the usual case is paste → glance → import.
 * Keeping the mapping explicit means it works with any client's sheet layout,
 * not just one hard-coded format.
 */
export function ImportDialog({ open, onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [roles, setRoles] = useState<ColumnRole[] | null>(null);
  const [fileTable, setFileTable] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pastedTable = useMemo(() => parseTable(text), [text]);
  const table = fileTable ?? pastedTable;

  const loadFile = async (file: File) => {
    setFileError(null);
    try {
      const parsed = await readSpreadsheetFile(file);
      if (parsed.header.length === 0) throw new Error("no rows found");
      setFileTable(parsed);
      setFileName(file.name);
      setRoles(null);
    } catch (err) {
      setFileError(
        `Could not read ${file.name}: ${err instanceof Error ? err.message : "unknown error"}. ` +
          `Try saving it as CSV, or copy the rows and paste them instead.`
      );
    }
  };

  const onFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  // Re-guess whenever a new table is pasted.
  const effectiveRoles = useMemo(() => {
    if (!table) return null;
    if (roles && roles.length === table.header.length) return roles;
    return guessRoles(table.header);
  }, [table, roles]);

  const result = useMemo(
    () => (table && effectiveRoles ? buildLines(table, effectiveRoles) : null),
    [table, effectiveRoles]
  );

  if (!open) return null;

  const setRole = (index: number, role: ColumnRole) => {
    if (!effectiveRoles) return;
    const next = [...effectiveRoles];
    next[index] = role;
    setRoles(next);
  };

  const reset = () => {
    setText("");
    setRoles(null);
    setFileTable(null);
    setFileName(null);
    setFileError(null);
    setShowData(false);
  };

  // Portalled to the body: the workspace panel is a positioned, blurred,
  // overflow-hidden box, which would otherwise trap and clip the modal.
  return createPortal(
    <div className="imp-backdrop" onClick={onClose}>
      <div
        className="imp-window"
        role="dialog"
        aria-label="Import survey lines"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="imp-head">
          <div className="imp-title">Import lines from spreadsheet</div>
          <button className="imp-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="imp-body">
          {!table && (
            <>
              <div
                className={`imp-drop${dropping ? " is-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={onFileDrop}
              >
                <div className="imp-drop-icon">⊞</div>
                <div>
                  <b>Drop an Excel or CSV file here</b>
                  <div className="imp-drop-sub">.xlsx · .csv · .tsv — the first sheet is read</div>
                </div>
                <button className="imp-choose" onClick={() => fileInput.current?.click()}>
                  Choose file…
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={SPREADSHEET_ACCEPT}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              {fileError && <div className="imp-error">{fileError}</div>}

              <div className="imp-or">or paste rows</div>
              <p className="imp-hint">
                Copy from Excel — <b>including the header row</b>. Positions in degrees + decimal
                minutes (N°, N′, E°, E′) are handled.
              </p>
              <textarea
                className="imp-paste"
                value={text}
                placeholder="Paste spreadsheet rows here…"
                onChange={(e) => setText(e.target.value)}
              />
            </>
          )}

          {table && effectiveRoles && result && (
            <>
              <div className="imp-summary">
                {fileName && <span className="imp-file">📄 {fileName}</span>}
                <span className="imp-ok">{result.lines.length} lines ready</span>
                {result.skipped.length > 0 && (
                  <span className="imp-skip">{result.skipped.length} rows skipped</span>
                )}
                <button
                  className={`imp-toggle${showData ? " on" : ""}`}
                  onClick={() => setShowData((s) => !s)}
                >
                  {showData ? "▾" : "▸"} Data ({table.rows.length} rows)
                </button>
                <button className="imp-reset" onClick={reset}>
                  ↺ Start over
                </button>
              </div>

              {showData && (
                <div className="imp-grid">
                  <table>
                    <thead>
                      <tr>
                        <th className="imp-rownum">#</th>
                        {table.header.map((h, i) => (
                          <th key={i} title={h}>
                            {h || `Col ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, r) => (
                        <tr key={r}>
                          <td className="imp-rownum">{r + 1}</td>
                          {row.map((c, i) => (
                            <td key={i}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="imp-cols">
                {table.header.map((h, i) => (
                  <div key={i} className="imp-col">
                    <div className="imp-colhead" title={h}>
                      {h || `Column ${i + 1}`}
                    </div>
                    <div className="imp-sample" title={table.rows[0]?.[i]}>
                      {table.rows[0]?.[i] || "—"}
                    </div>
                    <select
                      className={`imp-role${effectiveRoles[i] === "ignore" ? " off" : ""}`}
                      value={effectiveRoles[i]}
                      onChange={(e) => setRole(i, e.target.value as ColumnRole)}
                      aria-label={`Role for column ${h || i + 1}`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {result.lines.length > 0 && (
                <div className="imp-preview">
                  <div className="imp-preview-title">Preview</div>
                  {result.lines.slice(0, 4).map((l, i) => (
                    <div key={i} className="imp-prow">
                      <span className={`imp-dot is-${l.status}`} />
                      <b>{l.name}</b>
                      <span className="imp-coord">{formatDdmPair(l.vertices[0])}</span>
                      <span className="imp-arrow">→</span>
                      <span className="imp-coord">
                        {formatDdmPair(l.vertices[l.vertices.length - 1])}
                      </span>
                    </div>
                  ))}
                  {result.lines.length > 4 && (
                    <div className="imp-more">+ {result.lines.length - 4} more…</div>
                  )}
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="imp-skipped">
                  Skipped: {result.skipped.slice(0, 3).map((s) => `row ${s.row} (${s.reason})`).join(", ")}
                  {result.skipped.length > 3 ? "…" : ""}
                </div>
              )}
            </>
          )}
        </div>

        <div className="imp-foot">
          {table && (
            <label className="imp-group">
              Into group
              <input
                value={groupName}
                placeholder="e.g. Flåte lines"
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>
          )}
          <button className="imp-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="imp-go"
            disabled={!result || result.lines.length === 0}
            onClick={() => {
              if (!result) return;
              onImport(result.lines, groupName.trim() || fileName?.replace(/\.\w+$/, ""));
              setGroupName("");
              reset();
              onClose();
            }}
          >
            Import {result?.lines.length ?? 0} lines
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

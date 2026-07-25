import React, { useState, useMemo, useCallback, useContext, createContext } from "react";
import {
  Upload, Copy, Download, Search, AlertTriangle, CheckCircle2,
  GitMerge, Plus, Minus, RotateCcw, ChevronDown, ChevronRight, FileJson2, Sun, Moon
} from "lucide-react";

// ---------- design tokens (dark + light) ----------
const DARK = {
  bg: "#0D1113",
  panel: "#141A1D",
  panelAlt: "#1A2226",
  border: "#262F34",
  borderSoft: "#1E2629",
  text: "#E7ECEE",
  muted: "#8A96A0",
  mutedDim: "#5C6870",
  add: "#59C783",
  remove: "#E2604B",
  warn: "#E8A33D",
  prod: "#4FB6C7",
  release2: "#9B8CF0",
  jsonKey: "#7FD1DE",
  jsonStr: "#B7D6A8",
  jsonNum: "#E3B25E",
  mono: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
};

const LIGHT = {
  bg: "#F5F7F8",
  panel: "#FFFFFF",
  panelAlt: "#EDF1F3",
  border: "#D7DEE3",
  borderSoft: "#E4E9EC",
  text: "#1B2427",
  muted: "#5E6A72",
  mutedDim: "#8B969D",
  add: "#1E8E5A",
  remove: "#C0392B",
  warn: "#B4720A",
  prod: "#127A93",
  release2: "#6247C9",
  jsonKey: "#0E7C90",
  jsonStr: "#276B41",
  jsonNum: "#A5680A",
  mono: DARK.mono,
  sans: DARK.sans,
};

const ThemeContext = createContext(DARK);

// ---------- json flatten / unflatten ----------
function flatten(obj, prefix = "", out = {}) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    out[prefix] = obj;
    return out;
  }
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    flatten(obj[k], path, out);
  }
  return out;
}

function unflatten(flatObj) {
  const root = {};
  for (const path of Object.keys(flatObj)) {
    const parts = path.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = flatObj[path];
  }
  return root;
}

function valsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- two-way diff: prod (value source of truth) vs nonProd (key-structure source of truth) ----------
function computeDiff(prod, nonProd) {
  const fp = flatten(prod || {});
  const fn = flatten(nonProd || {});
  const allKeys = new Set([...Object.keys(fp), ...Object.keys(fn)]);

  const rows = [];
  for (const key of allKeys) {
    const inProd = key in fp, inNonProd = key in fn;
    const prodVal = fp[key], nonProdVal = fn[key];

    let status, resolvedVal, hasResolved = true, note = "";

    if (inProd && !inNonProd) {
      status = "removed";
      hasResolved = false;
    } else if (!inProd && inNonProd) {
      status = "added";
      resolvedVal = nonProdVal;
      note = "New key from release2";
    } else if (valsEqual(prodVal, nonProdVal)) {
      status = "unchanged";
      resolvedVal = prodVal;
    } else {
      status = "synced-from-prod";
      resolvedVal = prodVal;
    }

    rows.push({ key, prodVal, nonProdVal, status, resolvedVal, hasResolved, note });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return { rows };
}

// ---------- status meta (theme-independent parts) ----------
const STATUS_META = {
  added: { label: "Added", icon: Plus },
  removed: { label: "Removed (check first)", icon: AlertTriangle },
  "synced-from-prod": { label: "Using prod value", icon: CheckCircle2 },
  "kept-release2": { label: "Using release2 value", icon: GitMerge },
  "kept-removed": { label: "Restored (kept on prod)", icon: CheckCircle2 },
  unchanged: { label: "Unchanged", icon: CheckCircle2 },
};

// color for a given status, resolved against the active theme
function statusColor(status, T) {
  const map = {
    added: T.add,
    removed: T.warn,
    "synced-from-prod": T.prod,
    "kept-release2": T.release2,
    "kept-removed": T.warn,
    unchanged: T.mutedDim,
  };
  return map[status];
}

// applies a manual override (if any) on top of the default prod-wins resolution for a row
function resolveRow(r, overrides) {
  if (r.status === "synced-from-prod") {
    const choice = overrides[r.key] || "prod";
    return choice === "prod"
      ? { effectiveStatus: "synced-from-prod", resolvedVal: r.prodVal, hasResolved: true }
      : { effectiveStatus: "kept-release2", resolvedVal: r.nonProdVal, hasResolved: true };
  }
  if (r.status === "removed") {
    const choice = overrides[r.key] || "drop";
    return choice === "keep"
      ? { effectiveStatus: "kept-removed", resolvedVal: r.prodVal, hasResolved: true }
      : { effectiveStatus: "removed", hasResolved: false };
  }
  return { effectiveStatus: r.status, resolvedVal: r.resolvedVal, hasResolved: r.hasResolved };
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "removed", label: "Removed" },
  { key: "synced-from-prod", label: "Synced from prod" },
  { key: "added", label: "Added" },
  { key: "unchanged", label: "Unchanged" },
];

function fmtVal(v) {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

const SAMPLE = {
  prod: {
    auth: { login: { title: "Sign in to continue", emailLabel: "Email" }, logoutButton: "Log out" },
    booking: { confirmButton: "Confirm booking", cancelButton: "Cancel" },
  },
  nonProd: {
    auth: { login: { title: "Sign in", emailLabel: "Email address" }, logoutButton: "Log out" },
    booking: { confirmButton: "Confirm & pay", newField: "Coming soon" },
  },
};

// ---------- JSON input panel ----------
function JsonPanel({ label, accent, value, onChange, error }) {
  const T = useContext(ThemeContext);
  const [open, setOpen] = useState(true);
  const fileRef = React.useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10,
      overflow: "hidden", flex: "1 1 320px", minWidth: 280,
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", background: T.panelAlt, border: "none",
          borderBottom: open ? `1px solid ${T.border}` : "none", cursor: "pointer",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accent, flexShrink: 0 }} />
        <span style={{ color: T.text, fontFamily: T.sans, fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>
          {label}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <label
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex", alignItems: "center", gap: 4, color: T.muted, fontSize: 11,
              fontFamily: T.sans, cursor: "pointer", padding: "3px 7px", borderRadius: 6,
              border: `1px solid ${T.border}`,
            }}
          >
            <Upload size={11} /> file
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {open ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: 10 }}>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Paste ${label} JSON here…`}
            spellCheck={false}
            style={{
              width: "100%", height: 160, resize: "vertical", background: T.bg,
              color: T.text, border: `1px solid ${error ? T.remove : T.borderSoft}`,
              borderRadius: 7, padding: 8, fontFamily: T.mono, fontSize: 12,
              lineHeight: 1.5, outline: "none", boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{ color: T.remove, fontSize: 11, fontFamily: T.sans, marginTop: 5, display: "flex", gap: 4, alignItems: "center" }}>
              <AlertTriangle size={11} /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- highlighted merged-json renderer ----------
function buildLines(node, keyLabel, keyPath, depth, isLastSibling, statusMap, out) {
  const comma = isLastSibling ? "" : ",";
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const keys = Object.keys(node);
    out.push({ depth, type: "open", key: keyLabel });
    if (keys.length === 0) {
      out.push({ depth: depth + 1, type: "empty" });
    } else {
      keys.forEach((k, i) => {
        buildLines(node[k], k, keyPath ? `${keyPath}.${k}` : k, depth + 1, i === keys.length - 1, statusMap, out);
      });
    }
    out.push({ depth, type: "close", comma });
  } else {
    out.push({ depth, type: "leaf", key: keyLabel, value: node, comma, status: statusMap[keyPath] });
  }
}

function formatLeaf(value, T) {
  if (value === undefined) return { text: "null", color: T.mutedDim };
  if (value === null) return { text: "null", color: T.mutedDim };
  if (typeof value === "string") return { text: `"${value}"`, color: T.jsonStr };
  return { text: String(value), color: T.jsonNum };
}

const STATUS_MARKER = { added: "+", "synced-from-prod": "~", "kept-release2": "≈", "kept-removed": "!" };

function JsonLine({ entry }) {
  const T = useContext(ThemeContext);
  const lineColor = statusColor(entry.status, T);
  const marker = STATUS_MARKER[entry.status] || " ";
  let inner;
  if (entry.type === "open") {
    inner = (
      <>
        {entry.key !== undefined && (
          <><span style={{ color: T.jsonKey }}>{`"${entry.key}"`}</span><span style={{ color: T.mutedDim }}>: </span></>
        )}
        <span style={{ color: T.mutedDim }}>{"{"}</span>
      </>
    );
  } else if (entry.type === "close") {
    inner = <><span style={{ color: T.mutedDim }}>{"}"}</span><span style={{ color: T.mutedDim }}>{entry.comma}</span></>;
  } else if (entry.type === "empty") {
    inner = <span style={{ color: T.mutedDim }}>// no keys</span>;
  } else {
    const { text, color } = formatLeaf(entry.value, T);
    inner = (
      <>
        <span style={{ color: T.jsonKey }}>{`"${entry.key}"`}</span>
        <span style={{ color: T.mutedDim }}>: </span>
        <span style={{ color: lineColor || color }}>{text}</span>
        <span style={{ color: T.mutedDim }}>{entry.comma}</span>
      </>
    );
  }
  return (
    <div style={{
      display: "flex", paddingLeft: entry.depth * 14, background: lineColor ? `${lineColor}14` : "transparent",
      borderLeft: `2px solid ${lineColor || "transparent"}`,
    }}>
      <span style={{ width: 14, flexShrink: 0, color: lineColor || "transparent", userSelect: "none" }}>{marker}</span>
      <span>{inner}</span>
    </div>
  );
}

function HighlightedJson({ data, statusMap }) {
  const T = useContext(ThemeContext);
  const lines = useMemo(() => {
    const out = [];
    buildLines(data, undefined, "", 0, true, statusMap, out);
    return out;
  }, [data, statusMap]);
  return (
    <div style={{ padding: "10px 4px", fontFamily: T.mono, fontSize: 11.5, lineHeight: 1.65 }}>
      {lines.map((entry, i) => <JsonLine key={i} entry={entry} />)}
    </div>
  );
}

function Toggle({ options, active, onChange }) {
  const T = useContext(ThemeContext);
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            fontSize: 10, fontFamily: T.sans, padding: "2px 7px", borderRadius: 999,
            border: `1px solid ${active === opt.value ? opt.color : T.border}`,
            background: active === opt.value ? `${opt.color}22` : "transparent",
            color: active === opt.value ? opt.color : T.mutedDim, cursor: "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, color, label, count, onClick }) {
  const T = useContext(ThemeContext);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
        borderRadius: 999, border: `1px solid ${active ? color : T.border}`,
        background: active ? `${color}1c` : "transparent", cursor: "pointer",
        fontFamily: T.sans, fontSize: 12, color: active ? T.text : T.muted,
        transition: "all 120ms ease", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      {label}
      <span style={{ color: T.mutedDim, fontFamily: T.mono, fontSize: 11 }}>{count}</span>
    </button>
  );
}

function TranslationMergeToolInner() {
  const T = useContext(ThemeContext);
  const [prodText, setProdText] = useState("");
  const [nonProdText, setNonProdText] = useState("");
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [mergedOpen, setMergedOpen] = useState(true);
  const [overrides, setOverrides] = useState({});

  const loadSample = () => {
    setProdText(JSON.stringify(SAMPLE.prod, null, 2));
    setNonProdText(JSON.stringify(SAMPLE.nonProd, null, 2));
    setErrors({});
    setResult(null);
    setOverrides({});
  };

  const reset = () => {
    setProdText(""); setNonProdText("");
    setErrors({}); setResult(null); setFilter("all"); setSearch(""); setOverrides({});
  };

  const runCompare = useCallback(() => {
    const parsed = {};
    const errs = {};
    for (const [k, v] of [["prod", prodText], ["nonProd", nonProdText]]) {
      if (!v.trim()) { errs[k] = "Required"; continue; }
      try { parsed[k] = JSON.parse(v); }
      catch (e) { errs[k] = "Invalid JSON: " + e.message; }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) { setResult(null); return; }
    const diff = computeDiff(parsed.prod, parsed.nonProd);
    setResult(diff);
    setFilter("all");
    setOverrides({});
  }, [prodText, nonProdText]);

  const counts = useMemo(() => {
    if (!result) return {};
    const c = {};
    for (const r of result.rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [result]);

  const filteredRows = useMemo(() => {
    if (!result) return [];
    return result.rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (search && !r.key.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [result, filter, search]);

  const mergedFlat = useMemo(() => {
    if (!result) return {};
    const flat = {};
    for (const r of result.rows) {
      const eff = resolveRow(r, overrides);
      if (eff.hasResolved) flat[r.key] = eff.resolvedVal;
    }
    return flat;
  }, [result, overrides]);

  const mergedData = useMemo(() => unflatten(mergedFlat), [mergedFlat]);
  const mergedJsonStr = useMemo(() => JSON.stringify(mergedData, null, 2), [mergedData]);

  const statusMap = useMemo(() => {
    if (!result) return {};
    const m = {};
    for (const r of result.rows) {
      const eff = resolveRow(r, overrides);
      if (["added", "synced-from-prod", "kept-release2", "kept-removed"].includes(eff.effectiveStatus)) {
        m[r.key] = eff.effectiveStatus;
      }
    }
    return m;
  }, [result, overrides]);

  const copyMerged = async () => {
    try {
      await navigator.clipboard.writeText(mergedJsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const downloadMerged = () => {
    const blob = new Blob([mergedJsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "merged.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const attentionCount = counts["removed"] || 0;

  return (
    <div style={{
      background: T.bg, minHeight: "100%", padding: "20px 18px 40px",
      fontFamily: T.sans, boxSizing: "border-box",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, color: T.prod,
              fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
            }}>
              <FileJson2 size={13} /> prod → release2 reconciliation
            </div>
            <h1 style={{ color: T.text, fontSize: 22, fontWeight: 650, margin: 0, letterSpacing: -0.2 }}>
              Translation Merge Tool
            </h1>
            <p style={{ color: T.muted, fontSize: 13, margin: "6px 0 0", maxWidth: 600, lineHeight: 1.5 }}>
              Two-way diff between live prod (PO edits values via admin — the source of truth for
              content) and non-prod release2 (dev owns key structure: add/remove). Any value that
              exists on both sides always takes prod's current value. Run once per locale (en, th).
            </p>
          </div>
          <ThemeSwitch />
        </div>

        {/* inputs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <JsonPanel label="prod.json (live, PO-edited values)" accent={T.prod} value={prodText} onChange={setProdText} error={errors.prod} />
          <JsonPanel label="nonProd.json (release2, dev-owned keys)" accent={T.release2} value={nonProdText} onChange={setNonProdText} error={errors.nonProd} />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <button onClick={runCompare} style={{
            display: "flex", alignItems: "center", gap: 6, background: T.text, color: T.bg,
            border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: T.sans,
          }}>
            <GitMerge size={14} /> Compare & merge
          </button>
          <button onClick={loadSample} style={{
            background: "transparent", color: T.muted, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: "9px 14px", fontSize: 13, cursor: "pointer", fontFamily: T.sans,
          }}>
            Load sample
          </button>
          <button onClick={reset} style={{
            display: "flex", alignItems: "center", gap: 5, background: "transparent", color: T.muted,
            border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13,
            cursor: "pointer", fontFamily: T.sans,
          }}>
            <RotateCcw size={12} /> Reset
          </button>
        </div>

        {result && (
          <>
            {attentionCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, background: `${T.warn}14`,
                border: `1px solid ${T.warn}44`, borderRadius: 8, padding: "9px 12px", marginBottom: 16,
              }}>
                <AlertTriangle size={15} color={T.warn} style={{ flexShrink: 0 }} />
                <span style={{ color: T.text, fontSize: 12.5 }}>
                  {attentionCount} key{attentionCount > 1 ? "s" : ""} exist on prod but not in release2 —
                  confirm each removal is intentional before merging.
                </span>
              </div>
            )}

            {/* summary chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {FILTERS.map((f) => {
                const count = f.key === "all" ? result.rows.length : (counts[f.key] || 0);
                if (f.key !== "all" && count === 0) return null;
                const color = f.key === "all" ? T.text : (statusColor(f.key, T) || T.muted);
                return (
                  <Chip key={f.key} active={filter === f.key} color={color} label={f.label} count={count}
                    onClick={() => setFilter(f.key)} />
                );
              })}
            </div>

            {/* search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7, background: T.panel,
              border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", marginBottom: 10, maxWidth: 320,
            }}>
              <Search size={13} color={T.muted} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by key…"
                style={{
                  background: "transparent", border: "none", outline: "none", color: T.text,
                  fontSize: 12.5, fontFamily: T.mono, width: "100%",
                }}
              />
            </div>

            {/* table */}
            <div style={{
              border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20,
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1.5fr 1.2fr 1.2fr 1.6fr",
                background: T.panelAlt, padding: "8px 12px", fontSize: 10.5, color: T.mutedDim,
                textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600,
              }}>
                <div>Key</div><div>Prod</div><div>Release2</div><div>Resolved / status</div>
              </div>
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {filteredRows.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: T.mutedDim, fontSize: 12.5 }}>
                    No keys match this filter.
                  </div>
                )}
                {filteredRows.map((r, i) => {
                  const eff = resolveRow(r, overrides);
                  const meta = STATUS_META[eff.effectiveStatus] || STATUS_META.unchanged;
                  const metaColor = statusColor(eff.effectiveStatus, T) || T.muted;
                  const Icon = meta.icon;
                  return (
                    <div key={r.key} style={{
                      display: "grid", gridTemplateColumns: "1.5fr 1.2fr 1.2fr 1.6fr",
                      padding: "8px 12px", fontSize: 12, borderTop: `1px solid ${T.borderSoft}`,
                      background: i % 2 === 0 ? "transparent" : `${T.panel}80`, alignItems: "center",
                    }}>
                      <div style={{ color: T.text, fontFamily: T.mono, fontSize: 11.5, wordBreak: "break-all", paddingRight: 8 }}>
                        {r.key}
                      </div>
                      <div style={{ color: T.prod, fontFamily: T.mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fmtVal(r.prodVal)}
                      </div>
                      <div style={{ color: T.release2, fontFamily: T.mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fmtVal(r.nonProdVal)}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, color: metaColor, fontSize: 11, fontWeight: 600, marginBottom: r.note ? 2 : 0 }}>
                          <Icon size={11} /> {meta.label}
                        </div>
                        {r.note && (
                          <div style={{ color: T.mutedDim, fontSize: 10.5, lineHeight: 1.3 }}>{r.note}</div>
                        )}
                        {(r.status === "synced-from-prod" || r.status === "removed") && (
                          <div style={{
                            color: metaColor, fontFamily: T.mono, fontSize: 10.5, marginTop: 4,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            → {eff.hasResolved ? fmtVal(eff.resolvedVal) : "(key dropped)"}
                          </div>
                        )}
                        {r.status === "synced-from-prod" && (
                          <Toggle
                            active={overrides[r.key] || "prod"}
                            onChange={(v) => setOverrides((o) => ({ ...o, [r.key]: v }))}
                            options={[
                              { value: "prod", label: "Use prod (current)", color: T.prod },
                              { value: "nonProd", label: "Use release2 (incoming)", color: T.release2 },
                            ]}
                          />
                        )}
                        {r.status === "removed" && (
                          <Toggle
                            active={overrides[r.key] || "drop"}
                            onChange={(v) => setOverrides((o) => ({ ...o, [r.key]: v }))}
                            options={[
                              { value: "drop", label: "Drop key", color: T.mutedDim },
                              { value: "keep", label: "Keep on prod", color: T.warn },
                            ]}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* merged output */}
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
              <button onClick={() => setMergedOpen(!mergedOpen)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                background: T.panelAlt, border: "none", cursor: "pointer",
                borderBottom: mergedOpen ? `1px solid ${T.border}` : "none", flexWrap: "wrap",
              }}>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>Merged output (release2 → prod)</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 14, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.add, fontSize: 10.5, fontFamily: T.mono }}>
                    <b>+</b> added
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.prod, fontSize: 10.5, fontFamily: T.mono }}>
                    <b>~</b> from prod
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.release2, fontSize: 10.5, fontFamily: T.mono }}>
                    <b>≈</b> from release2 (manual)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.warn, fontSize: 10.5, fontFamily: T.mono }}>
                    <b>!</b> restored (manual)
                  </span>
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); copyMerged(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, color: T.muted, fontSize: 11,
                      padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, cursor: "pointer",
                    }}
                  >
                    <Copy size={11} /> {copied ? "Copied" : "Copy"}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); downloadMerged(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, color: T.muted, fontSize: 11,
                      padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, cursor: "pointer",
                    }}
                  >
                    <Download size={11} /> Download
                  </span>
                  {mergedOpen ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
                </span>
              </button>
              {mergedOpen && (
                <div style={{ background: T.bg, maxHeight: 340, overflow: "auto" }}>
                  <HighlightedJson data={mergedData} statusMap={statusMap} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ThemeSwitch() {
  const T = useContext(ThemeContext);
  const { mode, setMode } = useContext(ModeContext);
  return (
    <button
      onClick={() => setMode(mode === "dark" ? "light" : "dark")}
      style={{
        display: "flex", alignItems: "center", gap: 6, background: T.panel,
        border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 12px",
        color: T.text, fontSize: 12, fontFamily: T.sans, cursor: "pointer", flexShrink: 0,
      }}
    >
      {mode === "dark" ? <Moon size={13} /> : <Sun size={13} />}
      {mode === "dark" ? "Dark" : "Light"}
    </button>
  );
}

const ModeContext = createContext({ mode: "dark", setMode: () => {} });

export default function TranslationMergeTool() {
  const [mode, setMode] = useState("dark");
  const T = mode === "dark" ? DARK : LIGHT;
  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      <ThemeContext.Provider value={T}>
        <TranslationMergeToolInner />
      </ThemeContext.Provider>
    </ModeContext.Provider>
  );
}

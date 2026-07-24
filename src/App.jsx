import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, FileJson2, GitMerge, Plus, RotateCcw, Search, Upload } from "lucide-react";
import "./App.css";

const colors = { bg: "#0d1113", panel: "#141a1d", panelAlt: "#1a2226", border: "#262f34", text: "#e7ecee", muted: "#8a96a0", dim: "#5c6870", add: "#59c783", warn: "#e8a33d", prod: "#4fb6c7", incoming: "#9b8cf0" };
const sample = { prod: { auth: { login: { title: "Sign in to continue", emailLabel: "Email" }, logoutButton: "Log out" }, booking: { confirmButton: "Confirm booking", cancelButton: "Cancel" } }, nonProd: { auth: { login: { title: "Sign in", emailLabel: "Email address" }, logoutButton: "Log out" }, booking: { confirmButton: "Confirm & pay", newField: "Coming soon" } } };

function flatten(value, prefix = "", output = {}) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) { output[prefix] = value; return output; }
    const keys = Object.keys(value);
    if (!keys.length) { output[prefix] = value; return output; }
    keys.forEach((key) => flatten(value[key], prefix ? `${prefix}.${key}` : key, output));
    return output;
}
function unflatten(flat) {
    const root = {};
    Object.entries(flat).forEach(([path, value]) => { const parts = path.split("."); let cursor = root; parts.slice(0, -1).forEach((part) => { cursor[part] ||= {}; cursor = cursor[part]; }); cursor[parts.at(-1)] = value; });
    return root;
}
function diff(prod, nonProd) {
    const left = flatten(prod || {}), right = flatten(nonProd || {});
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => {
        const hasLeft = key in left, hasRight = key in right;
        if (hasLeft && !hasRight) return { key, prod: left[key], status: "removed", note: "Not present in release2" };
        if (!hasLeft) return { key, release2: right[key], resolved: right[key], status: "added", note: "New key from release2" };
        if (JSON.stringify(left[key]) === JSON.stringify(right[key])) return { key, prod: left[key], release2: right[key], resolved: left[key], status: "unchanged" };
        return { key, prod: left[key], release2: right[key], resolved: left[key], status: "synced", note: "Prod value wins by default" };
    }).sort((a, b) => a.key.localeCompare(b.key));
}
function resolved(row, overrides) {
    if (row.status === "synced") return overrides[row.key] === "release2" ? { status: "release2", value: row.release2, keep: true } : { status: row.status, value: row.prod, keep: true };
    if (row.status === "removed") return overrides[row.key] === "keep" ? { status: "kept", value: row.prod, keep: true } : { status: row.status, keep: false };
    return { status: row.status, value: row.resolved, keep: true };
}
const meta = { added: ["Added", colors.add, Plus], removed: ["Removed (check first)", colors.warn, AlertTriangle], synced: ["Using prod value", colors.prod, CheckCircle2], release2: ["Using release2 value", colors.incoming, GitMerge], kept: ["Restored (kept on prod)", colors.warn, CheckCircle2], unchanged: ["Unchanged", colors.dim, CheckCircle2] };

function JsonPanel({ label, accent, value, onChange, error }) {
    const [open, setOpen] = useState(true); const input = useRef(null);
    const upload = (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (result) => onChange(result.target.result); reader.readAsText(file); };
    return <section className="json-panel"><button className="panel-heading" onClick={() => setOpen(!open)}><i style={{ background: accent }} /> <b>{label}</b><span className="panel-actions"><label onClick={(event) => event.stopPropagation()}><Upload size={11} /> file<input ref={input} type="file" accept=".json,application/json" onChange={upload} /></label>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span></button>{open && <div className="panel-body"><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Paste ${label} JSON here...`} spellCheck="false" className={error ? "invalid" : ""} />{error && <small className="error"><AlertTriangle size={11} /> {error}</small>}</div>}</section>;
}
function Toggle({ value, onChange, options }) { return <div className="toggle">{options.map(([key, label, color]) => <button key={key} onClick={() => onChange(key)} className={value === key ? "selected" : ""} style={value === key ? { color, borderColor: color } : {}}>{label}</button>)}</div>; }
function JsonPreview({ data, statusMap }) {
    const render = (value, path = "", depth = 0) => {
        if (value && typeof value === "object" && !Array.isArray(value)) return <>{Object.entries(value).map(([key, child], index, all) => <div key={key} style={{ paddingLeft: depth * 14 }}><span className="marker"> </span><span className="json-key">"{key}"</span><span className="punct">: </span>{render(child, path ? `${path}.${key}` : key, depth)}{index < all.length - 1 && <span className="punct">,</span>}</div>)}</>;
        const status = statusMap[path]; const color = status === "added" ? colors.add : status === "synced" ? colors.prod : status === "release2" ? colors.incoming : status === "kept" ? colors.warn : typeof value === "string" ? "#b7d6a8" : "#e3b25e";
        return <span style={{ color }}><span className="marker">{status === "added" ? "+" : status === "synced" ? "~" : status === "release2" ? "≈" : status === "kept" ? "!" : " "}</span>{JSON.stringify(value)}</span>;
    };
    return <pre className="preview">{`{\n`}{render(data)}{`\n}`}</pre>;
}

export default function App() {
    const [prodText, setProdText] = useState(""), [releaseText, setReleaseText] = useState(""), [errors, setErrors] = useState({}), [rows, setRows] = useState(null), [filter, setFilter] = useState("all"), [search, setSearch] = useState(""), [overrides, setOverrides] = useState({}), [open, setOpen] = useState(true), [copied, setCopied] = useState(false);
    const compare = () => { const parsed = {}, next = {};[["prod", prodText], ["release2", releaseText]].forEach(([key, text]) => { if (!text.trim()) next[key] = "Required"; else try { parsed[key] = JSON.parse(text); } catch (error) { next[key] = `Invalid JSON: ${error.message}`; } }); setErrors(next); if (Object.keys(next).length) return setRows(null); setRows(diff(parsed.prod, parsed.release2)); setOverrides({}); };
    const loadSample = () => { setProdText(JSON.stringify(sample.prod, null, 2)); setReleaseText(JSON.stringify(sample.nonProd, null, 2)); setErrors({}); setRows(null); setOverrides({}); };
    const reset = () => { setProdText(""); setReleaseText(""); setErrors({}); setRows(null); setFilter("all"); setSearch(""); setOverrides({}); };
    const counts = useMemo(() => rows?.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {}) || {}, [rows]);
    const visible = useMemo(() => rows?.filter((row) => (filter === "all" || row.status === filter) && row.key.toLowerCase().includes(search.toLowerCase())) || [], [rows, filter, search]);
    const merged = useMemo(() => { const flat = {}; rows?.forEach((row) => { const item = resolved(row, overrides); if (item.keep) flat[row.key] = item.value; }); return unflatten(flat); }, [rows, overrides]);
    const mergedString = JSON.stringify(merged, null, 2); const statusMap = Object.fromEntries(rows?.map((row) => [row.key, resolved(row, overrides).status]).filter(([, status]) => status !== "unchanged") || []);
    const copy = async () => { await navigator.clipboard.writeText(mergedString); setCopied(true); setTimeout(() => setCopied(false), 1600); }; const download = () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([mergedString], { type: "application/json" })); link.download = "merged.json"; link.click(); };
    return <main className="app-shell"><div className="app-content"><header><div className="eyebrow"><FileJson2 size={13} /> prod -&gt; release2 reconciliation</div><h1>Translation Merge Tool</h1><p>Two-way diff between live prod and non-prod release2. Shared values use prod as the source of truth; release2 owns key structure. Run once per locale.</p></header><div className="input-grid"><JsonPanel label="prod.json (live, PO-edited values)" accent={colors.prod} value={prodText} onChange={setProdText} error={errors.prod} /><JsonPanel label="nonProd.json (release2, dev-owned keys)" accent={colors.incoming} value={releaseText} onChange={setReleaseText} error={errors.release2} /></div><div className="actions"><button className="primary" onClick={compare}><GitMerge size={14} /> Compare &amp; merge</button><button onClick={loadSample}>Load sample</button><button onClick={reset}><RotateCcw size={12} /> Reset</button></div>{rows && <><>{counts.removed > 0 && <div className="warning"><AlertTriangle size={15} /> {counts.removed} key{counts.removed > 1 ? "s" : ""} exist on prod but not in release2 - confirm removal.</div>}</><div className="chips">{[["all", "All"], ["removed", "Removed"], ["synced", "Synced from prod"], ["added", "Added"], ["unchanged", "Unchanged"]].map(([key, label]) => { const count = key === "all" ? rows.length : counts[key] || 0; return key === "all" || count ? <button className={`chip ${filter === key ? "active" : ""}`} key={key} onClick={() => setFilter(key)}>{label} <small>{count}</small></button> : null; })}</div><div className="search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by key..." /></div><div className="table"><div className="table-head"><span>Key</span><span>Prod</span><span>Release2</span><span>Resolved / status</span></div>{visible.length ? visible.map((row) => { const item = resolved(row, overrides), [label, color, Icon] = meta[item.status]; return <div className="table-row" key={row.key}><code>{row.key}</code><code className="prod-value">{row.prod === undefined ? "-" : JSON.stringify(row.prod)}</code><code className="incoming-value">{row.release2 === undefined ? "-" : JSON.stringify(row.release2)}</code><div className="status-cell"><strong style={{ color }}><Icon size={11} /> {label}</strong>{row.note && <small>{row.note}</small>}{row.status === "synced" && <Toggle value={overrides[row.key] || "prod"} onChange={(value) => setOverrides((old) => ({ ...old, [row.key]: value }))} options={[["prod", "Use prod", colors.prod], ["release2", "Use release2", colors.incoming]]} />}{row.status === "removed" && <Toggle value={overrides[row.key] || "drop"} onChange={(value) => setOverrides((old) => ({ ...old, [row.key]: value }))} options={[["drop", "Drop key", colors.dim], ["keep", "Keep on prod", colors.warn]]} />}</div></div>; }) : <div className="empty">No keys match this filter.</div>}</div><section className="output"><button className="output-heading" onClick={() => setOpen(!open)}><b>Merged output (release2 -&gt; prod)</b><span className="legend">+ added &nbsp; ~ from prod &nbsp; ≈ manual release2 &nbsp; ! restored</span><span className="output-actions"><span onClick={(event) => { event.stopPropagation(); copy(); }}><Copy size={11} /> {copied ? "Copied" : "Copy"}</span><span onClick={(event) => { event.stopPropagation(); download(); }}><Download size={11} /> Download</span>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span></button>{open && <JsonPreview data={merged} statusMap={statusMap} />}</section></>}</div></main>;
}

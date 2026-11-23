import { useCallback, useEffect, useState } from "react";
import { get, post, type Report, type Result, type ShipConfig, type ShipPlan, type Summary } from "./api";

const TARGET_TH: Record<string, string> = { web: "เว็บ", windows: "วินโดวส์", linux: "ลินุกซ์", android: "แอนดรอยด์" };
const sh = (argv: string[]) => argv.map((a) => (/[\s"'$`]/.test(a) ? JSON.stringify(a) : a)).join(" ");
const mb = (b?: number) => (b ? `${(b / 1048576).toFixed(1)} MB` : "");

export function App() {
  const [ws, setWs] = useState<Summary | null>(null);
  const [doctor, setDoctor] = useState<Array<[boolean, string, string]>>([]);
  const [sel, setSel] = useState("");
  const [status, setStatus] = useState("");
  const reload = useCallback(async () => {
    try {
      const s = await get<Summary>("/api/workspace");
      setWs(s);
      setSel((cur) => cur || s.games[0]?.id || "");
      setDoctor((await get<{ lines: Array<[boolean, string, string]> }>("/api/doctor")).lines);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }, []);
  useEffect(() => void reload(), [reload]);
  if (!ws) return <div className="loading">Loading… {status}</div>;
  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" />
          <div>
            <h1 className="brand">Easy <span>Ship</span></h1>
            <p className="brand-th">ส่งเกมขึ้นเว็บ วินโดวส์ แอนดรอยด์ · {ws.games.length} games · dry run by default</p>
          </div>
        </div>
        <div className="status">{status || ws.root}</div>
      </header>
      <div className="layout">
        <aside className="panel list">
          <h3>Games</h3>
          {ws.games.map((g) => (
            <button key={g.id} className={`item-btn${g.id === sel ? " on" : ""}`} onClick={() => setSel(g.id)} data-game={g.id}>
              <b>{g.name.th}</b> <small className="mono">{g.version}</small>
              <br />
              <small>{g.engine} · {g.targets.map((t) => TARGET_TH[t] ?? t).join(" · ")}</small>
            </button>
          ))}
          <h3>Doctor</h3>
          <div className="doctor">
            {doctor.map(([ok, label, detail]) => (
              <p key={label} className={ok ? "ok" : "bad"} title={detail}>
                <b>{ok ? "✓" : "✗"}</b> {label}
                <small>{detail}</small>
              </p>
            ))}
            <button onClick={() => get<{ lines: Array<[boolean, string, string]> }>("/api/doctor?fresh=1").then((r) => setDoctor(r.lines))}>re-check</button>
          </div>
          {(ws.errors.length > 0 || ws.warnings.length > 0) && (
            <div className="diag">
              {ws.errors.map((d, i) => <p key={i} className="err">{d.path}: {d.message}</p>)}
              {ws.warnings.map((d, i) => <p key={i} className="warn">{d.path}: {d.message}</p>)}
            </div>
          )}
        </aside>
        {sel && <Game key={sel} id={sel} onStatus={setStatus} onSaved={reload} />}
      </div>
    </>
  );
}

function Game({ id, onStatus, onSaved }: { id: string; onStatus: (m: string) => void; onSaved: () => void }) {
  const [cfg, setCfg] = useState<ShipConfig | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [plan, setPlan] = useState<ShipPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const load = useCallback(async () => {
    const g = await get<{ config: ShipConfig; report: Report | null }>(`/api/game/${id}`);
    setCfg(g.config);
    setReport(g.report);
    setPlan(await get<ShipPlan>(`/api/plan/${id}`).catch(() => null));
  }, [id]);
  useEffect(() => void load().catch((e: Error) => onStatus(e.message)), [load, onStatus]);
  if (!cfg) return null;
  const build = async (targets?: string[]) => {
    setBusy(true);
    setLog(["building…"]);
    try {
      const r = await post<{ ok: boolean; results: Result[]; log: string[]; report: string }>(`/api/build/${id}`, { targets });
      setLog(r.log);
      onStatus(r.ok ? `built → ${r.report}` : "some targets failed");
      await load();
    } catch (e) {
      onStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (c: ShipConfig) => post<{ ok: boolean; errors: Array<{ message: string }> }>("/api/game", { config: c }).then((r) => { onStatus(r.ok ? `saved ships/${c.id}.easyship.json` : r.errors.map((e) => e.message).join("; ")); void load(); onSaved(); });
  return (
    <>
      <section className="panel">
        <h2>{cfg.name.th} <small>{cfg.name.en} · {cfg.version} · {cfg.engine}</small></h2>
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => build()} data-action="build">{busy ? "กำลังสร้าง…" : "▶ Build all · สร้าง"}</button>
          {cfg.targets.map((t) => <button key={t} disabled={busy} onClick={() => build([t])}>{TARGET_TH[t]} · {t}</button>)}
        </div>
        <p className="hint">Builds and zips locally into <span className="mono">releases/{cfg.id}/{cfg.version}/</span>. Uploading to itch.io is never done from here — run <span className="mono">easyship ship {cfg.id} --build --upload</span> yourself.</p>
        <div className="targets">
          {plan?.targets.map((t) => {
            const r = report?.results.find((x) => x.target === t.target);
            return (
              <div key={t.target} className={`target ${t.status}`} data-target={t.target}>
                <h3>{TARGET_TH[t.target]} · {t.target} <span className={`pill ${r?.status ?? t.status}`}>{r?.status ?? t.status}</span></h3>
                {r?.artifact && <p className="mono small">{r.artifact.split("/").pop()} · {mb(r.bytes)}{r.sha256 ? ` · ${r.sha256.slice(0, 12)}…` : ""}</p>}
                {t.blockers.map((b) => <p key={b} className="err">✗ {b}</p>)}
                {r?.error && r.status !== "blocked" && <p className="err">{r.error}</p>}
                <ol className="steps">
                  {t.steps.map((s, i) => <li key={i}>{s.label}{s.command && <code>{sh(s.command)}</code>}</li>)}
                </ol>
                {r?.checks.length ? <ul className="checks">{r.checks.map((c, i) => <li key={i} className={c.ok ? "ok" : "bad"}>{c.ok ? "✓" : "✗"} {c.label}</li>)}</ul> : null}
                {t.notes.map((n) => <p key={n} className="hint">{n}</p>)}
              </div>
            );
          })}
        </div>
        {log.length > 0 && <pre className="json">{log.join("\n")}</pre>}
      </section>
      <aside className="panel form">
        <h3>itch.io</h3>
        <p className={plan?.upload.possible ? "ok" : "warn"}>{plan?.upload.possible ? "Upload possible — from the CLI with --upload" : `Upload not possible yet: ${plan?.upload.blockers.join("; ")}`}</p>
        {plan?.upload.commands.map((c, i) => (
          <div key={i} className="cmd">
            <code>{sh(c)}</code>
            <button onClick={() => navigator.clipboard?.writeText(sh(c))}>copy</button>
          </div>
        ))}
        <h3>Config</h3>
        <ConfigForm cfg={cfg} onSave={save} />
        {report && <p className="hint">last build {new Date(report.at).toLocaleString()}</p>}
      </aside>
    </>
  );
}

function ConfigForm({ cfg, onSave }: { cfg: ShipConfig; onSave: (c: ShipConfig) => void }) {
  const [c, setC] = useState<ShipConfig>(cfg);
  const toggle = (t: ShipConfig["targets"][number]) => setC({ ...c, targets: c.targets.includes(t) ? c.targets.filter((x) => x !== t) : [...c.targets, t] });
  return (
    <div className="grid2">
      <label>ชื่อไทย<input value={c.name.th} onChange={(e) => setC({ ...c, name: { ...c.name, th: e.target.value } })} /></label>
      <label>English<input value={c.name.en} onChange={(e) => setC({ ...c, name: { ...c.name, en: e.target.value } })} /></label>
      <label>version<input value={c.version} onChange={(e) => setC({ ...c, version: e.target.value })} className="mono" /></label>
      <label>source<input value={c.source} onChange={(e) => setC({ ...c, source: e.target.value })} className="mono" /></label>
      <label>itch user<input value={c.itch?.user ?? ""} onChange={(e) => setC({ ...c, itch: { user: e.target.value, game: c.itch?.game ?? c.id } })} className="mono" /></label>
      <label>itch game<input value={c.itch?.game ?? ""} onChange={(e) => setC({ ...c, itch: { user: c.itch?.user ?? "", game: e.target.value } })} className="mono" /></label>
      {c.engine === "godot" && <label className="wide">Android package<input value={c.android?.package ?? ""} onChange={(e) => setC({ ...c, android: { ...(c.android ?? {}), package: e.target.value } })} className="mono" /></label>}
      <div className="chips wide">
        {(["web", "windows", "linux", "android"] as const).map((t) => <button key={t} className={c.targets.includes(t) ? "on" : ""} onClick={() => toggle(t)}>{t}</button>)}
      </div>
      <div className="row wide"><button className="primary" onClick={() => onSave(c)}>Save · บันทึก</button></div>
    </div>
  );
}

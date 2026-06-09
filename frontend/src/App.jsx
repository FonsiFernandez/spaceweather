import React, { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const API = "http://localhost:8000";
const POLL_MS = 15_000;

const RISK_COLORS = {
  nominal: "#639922",
  elevated: "#BA7517",
  high: "#D85A30",
  severe: "#E24B4A",
  extreme: "#A32D2D",
};

const RISK_BG = {
  nominal: "#EAF3DE",
  elevated: "#FAEEDA",
  high: "#FAECE7",
  severe: "#FCEBEB",
  extreme: "#F7C1C1",
};

const SCALE_LABELS = ["Quiet", "Minor", "Moderate", "Strong", "Severe", "Extreme"];

function useFetch(path, interval = POLL_MS) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      const response = await fetch(`${API}${path}`);

      if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      setData(json);
      setError(null);
    } catch (e) {
      console.error("Fetch error:", path, e);
      setError(e.message);
    }
  }, [path]);

  useEffect(() => {
    fetch_();

    const id = setInterval(fetch_, interval);

    return () => clearInterval(id);
  }, [fetch_, interval]);

  return { data, error, refetch: fetch_ };
}

export default function App() {
  const { data: risk, error: riskError } = useFetch("/risk-level");
  const { data: sw, error: swError } = useFetch("/solar-wind");
  const { data: swHistory } = useFetch("/solar-wind/history");
  const { data: kp } = useFetch("/solar-wind/kp");
  const { data: events } = useFetch("/events/chains", 30_000);
  const { data: alerts } = useFetch("/alerts");
  const { data: briefing } = useFetch("/briefing", 60_000);
  const { data: sources } = useFetch("/solar-wind/sources", 30_000);
  const { data: forecast } = useFetch("/forecast", 60_000);
  const { data: operationalEvents } = useFetch("/events", 30_000);

  const [tab, setTab] = useState("overview");

  const level = risk?.overall_level ?? "nominal";
  const alertCount = Array.isArray(alerts) ? alerts.length : alerts?.count ?? 0;

  return (
      <div className="app-shell">
        <Header level={level} risk={risk} />

        <main className="app-container">
          {(riskError || swError) && (
            <div
              className="card card-pad"
              style={{
                borderColor: "rgba(239, 68, 68, 0.45)",
                color: "var(--accent-red)",
                marginBottom: 14,
              }}
            >
              Backend connection issue: {riskError || swError}
            </div>
          )}

          <MissionHero risk={risk} sources={sources} />

          <Tabs tab={tab} setTab={setTab} alertCount={alertCount} />

          {tab === "overview" && (
            <>
              <StatusBar risk={risk} sw={sw} />
              <SourceStatusPanel sources={sources} />

              <div className="grid-2">
                <KpChart kp={kp} />
                <BzChart swHistory={swHistory} />
              </div>

              <AssetMatrix risk={risk} />
            </>
          )}

          {tab === "forecast" && <ForecastPanel forecast={forecast} />}
          {tab === "events" && <OperationalEventsPanel events={operationalEvents} />}
          {tab === "chains" && <CausalChains chains={events} />}
          {tab === "alerts" && <AlertsPanel alerts={alerts} />}
          {tab === "briefing" && <BriefingPanel briefing={briefing} />}
        </main>
      </div>
    );
}

function Header({ level, risk }) {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand-mark" />

        <div>
          <div className="brand-title">Space Weather Mission Control</div>
          <div className="brand-subtitle">NOAA SWPC · NASA DONKI · Operational Risk Engine</div>
        </div>

        <div className="live-pill">
          <span className="live-dot" />
          LIVE DATA
        </div>

        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {risk ? `G${risk.g_scale} / S${risk.s_scale} / R${risk.r_scale}` : "Connecting..."}
        </span>

        <RiskBadge level={level} />
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const safeLevel = level ?? "nominal";
  const color = RISK_COLORS[safeLevel] ?? "#888";

  return (
    <span
      className="risk-badge"
      style={{
        background: `${color}1f`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {safeLevel}
    </span>
  );
}

function Tabs({ tab, setTab, alertCount }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "forecast", label: "Forecast" },
    { id: "events", label: "Events" },
    { id: "chains", label: "Causal chains" },
    { id: "alerts", label: alertCount ? `Alerts (${alertCount})` : "Alerts" },
    { id: "briefing", label: "Briefing" },
  ];

  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`tab-button ${tab === t.id ? "active" : ""}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function StatusBar({ risk }) {
  const metrics = [
    {
      label: "Kp index",
      value: risk?.kp_now !== undefined ? Number(risk.kp_now).toFixed(1) : "—",
      sub: risk?.kp_now >= 5 ? "Storm" : "Quiet",
    },
    {
      label: "Bz (nT)",
      value: risk?.bz_now !== null && risk?.bz_now !== undefined
        ? Number(risk.bz_now).toFixed(1)
        : "—",
      sub: risk?.bz_now < -10 ? "Southward" : "Stable",
    },
    {
      label: "Wind speed",
      value: risk?.wind_speed_now
        ? `${Math.round(risk.wind_speed_now)} km/s`
        : "—",
      sub: risk?.wind_speed_now > 600 ? "Elevated" : "Normal",
    },
    {
      label: "G-scale",
      value: `G${risk?.g_scale ?? 0}`,
      sub: SCALE_LABELS[risk?.g_scale ?? 0] || "Quiet",
    },
    {
      label: "S-scale",
      value: `S${risk?.s_scale ?? 0}`,
      sub: SCALE_LABELS[risk?.s_scale ?? 0] || "None",
    },
    {
      label: "R-scale",
      value: `R${risk?.r_scale ?? 0}`,
      sub: SCALE_LABELS[risk?.r_scale ?? 0] || "None",
    },
  ];

    return (
      <div className="metric-grid" style={{ marginTop: 14 }}>
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>
    );
}

function KpChart({ kp }) {
  const history = kp?.history ?? [];

  const data = history.slice(-24).map((d) => ({
    t: d.time_tag?.slice(11, 16) ?? "",
    kp: Number(d.kp ?? 0),
  }));

  return (
    <ChartCard title="Kp index — latest samples">
      {data.length === 0 ? (
        <EmptyState text="Waiting for Kp data from NOAA SWPC..." />
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#93a4b8" }} interval={3} />
            <YAxis domain={[0, 9]} tick={{ fontSize: 11, fill: "#93a4b8" }} ticks={[0, 3, 5, 7, 9]} />
            <Tooltip formatter={(v) => [Number(v).toFixed(1), "Kp"]} />
            <ReferenceLine y={5} stroke="#BA7517" strokeDasharray="3 3" />
            <ReferenceLine y={7} stroke="#E24B4A" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="kp" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function BzChart({ swHistory }) {
  const items = swHistory?.items ?? [];

  const data = items.slice(-60).map((d) => ({
    t: d.time_tag?.slice(11, 16) ?? "",
    bz: Number(d.bz ?? 0),
  }));

  return (
    <ChartCard title="IMF Bz — latest samples">
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#93a4b8" }} interval={9} />
          <YAxis tick={{ fontSize: 11, fill: "#93a4b8" }} />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} nT`, "Bz"]} />
          <ReferenceLine y={0} stroke="#cccccc" />
          <ReferenceLine y={-10} stroke="#BA7517" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="bz" stroke="#818cf8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card card-pad">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

function AssetMatrix({ risk }) {
  const assets = risk?.assets ?? [];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
        Asset risk matrix
      </div>

      {!assets.length ? (
        <EmptyState text="Waiting for risk assessment..." />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {assets.map((a) => (
            <div
              key={a.asset_id}
              style={{
                background: "linear-gradient(180deg, rgba(18, 28, 43, 0.96), rgba(13, 20, 32, 0.96))",
                border: `1px solid ${RISK_COLORS[a.risk_level] ?? "var(--border-subtle)"}`,
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.asset_name}</div>
                <RiskBadge level={a.risk_level} />
              </div>

              {(a.drivers ?? []).slice(0, 2).map((d, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-secondary, #555555)",
                    marginBottom: 2,
                  }}
                >
                  • {d}
                </div>
              ))}

              {(a.mitigations ?? [])[0] && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-tertiary, #777777)",
                    marginTop: 6,
                    borderTop: "0.5px solid var(--color-border-tertiary, #dddddd)",
                    paddingTop: 6,
                  }}
                >
                  Action: {a.mitigations[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CausalChains({ chains }) {
    const items = Array.isArray(chains) ? chains : chains?.items ?? chains?.chains ?? [];

  if (!items.length) {
    return <EmptyState text="No causal chains available yet. DONKI ingestion can be connected next." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((c, i) => (
        <ChainCard key={c.chain_id ?? c.id ?? i} chain={c} />
      ))}
    </div>
  );
}

function ChainCard({ chain }) {
  const status = chain.status ?? "unknown";

  const statusColor =
    {
      active: "#639922",
      in_transit: "#BA7517",
      recovery: "#185FA5",
      historical: "#888888",
      unknown: "#888888",
    }[status] ?? "#888888";

  const flare = chain.trigger_flare;
  const cme = chain.cme;
  const storm = chain.storm;

  return (
    <div
      style={{
        background: "var(--color-background-primary, #ffffff)",
        border: "0.5px solid var(--color-border-tertiary, #dddddd)",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: statusColor,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {String(status).replace("_", " ")}
        </span>

        {chain.total_transit_hours && (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-secondary, #555555)",
            }}
          >
            Transit: {chain.total_transit_hours}h
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {flare && (
          <ChainNode
            color="#534AB7"
            label={flare.class || flare.title || "Flare"}
            sub={formatTime(flare.time || flare.start_time)}
          />
        )}

        {flare && cme && <Arrow />}

        {cme && (
          <ChainNode
            color="#185FA5"
            label={`CME ${cme.speed ? `${Math.round(cme.speed)} km/s` : ""}`}
            sub={formatTime(cme.time || cme.start_time)}
          />
        )}

        {cme && storm && <Arrow />}

        {storm && (
          <ChainNode
            color={RISK_COLORS.high}
            label={`G${storm.g_scale ?? "?"} storm`}
            sub={formatTime(storm.time || storm.start_time)}
          />
        )}

        {!storm && cme?.is_earth_directed && (
          <>
            <Arrow />
            <ChainNode
              color="#BA7517"
              label="Earth impact?"
              sub={
                cme.estimated_arrival
                  ? `${cme.estimated_arrival.slice(0, 16)}Z (est.)`
                  : "ETA unknown"
              }
              dashed
            />
          </>
        )}
      </div>
    </div>
  );
}

function ChainNode({ color, label, sub, dashed }) {
  return (
    <div
      style={{
        background: "var(--color-background-secondary, #f7f6f2)",
        border: `${dashed ? "1.5px dashed" : "1px solid"} ${color}`,
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color }}>{label}</div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary, #777777)",
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <span style={{ color: "var(--color-text-tertiary, #777777)", fontSize: 16 }}>
      →
    </span>
  );
}

function AlertsPanel({ alerts }) {
  const items = Array.isArray(alerts) ? alerts : alerts?.items ?? alerts?.alerts ?? [];

  if (!items.length) {
    return <EmptyState text="No active alerts from NOAA SWPC." />;
  }

  const SEV_COLOR = {
    alert: "#E24B4A",
    warning: "#D85A30",
    watch: "#BA7517",
    summary: "#185FA5",
    info: "#888888",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((a, i) => {
        const severity = a.severity || a.message_type || a.product_id || "info";
        const issueTime = a.issue_time || a.issue_datetime || a.time_tag || a.valid_begin;
        const message =
          a.message ||
          a.description ||
          a.text ||
          a.summary ||
          JSON.stringify(a, null, 2);

        return (
          <div
            key={a.id ?? a.product_id ?? i}
            style={{
              background: "var(--color-background-primary, #ffffff)",
              border: "0.5px solid var(--color-border-tertiary, #dddddd)",
              borderRadius: 10,
              padding: "12px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  color: SEV_COLOR[String(severity).toLowerCase()] ?? "#888888",
                }}
              >
                {severity}
              </span>

              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-tertiary, #777777)",
                }}
              >
                {issueTime ? `${String(issueTime).slice(0, 16)}Z` : ""}
              </span>
            </div>

            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary, #555555)",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                maxHeight: 120,
                overflow: "auto",
              }}
            >
              {String(message).slice(0, 400)}
              {String(message).length > 400 ? "…" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BriefingPanel({ briefing }) {
  if (!briefing) {
    return <EmptyState text="Generating briefing..." />;
  }

  const level = briefing.level ?? briefing.overall_risk ?? "nominal";
  const actions = briefing.recommended_actions ?? [];
  const topAsset = briefing.top_risk_asset;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500 }}>Mission briefing</span>
        <RiskBadge level={level} />
      </div>

      <Panel title="Executive summary">
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          {briefing.summary ?? "No briefing summary available."}
        </div>
      </Panel>

      <Panel title="Recommended actions">
        {actions.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #777777)" }}>
            No specific actions required.
          </div>
        )}
      </Panel>

      {topAsset && (
        <Panel title="Top affected asset">
          <div style={{ fontSize: 14, fontWeight: 500 }}>{topAsset.asset_name}</div>
          <div style={{ marginTop: 8 }}>
            <RiskBadge level={topAsset.risk_level} />
          </div>
        </Panel>
      )}

      {briefing.solar_wind && (
        <Panel title="Current solar wind">
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              color: "var(--color-text-secondary, #555555)",
            }}
          >
            {JSON.stringify(briefing.solar_wind, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div
      style={{
        background: "var(--color-background-primary, #ffffff)",
        border: "0.5px solid var(--color-border-tertiary, #dddddd)",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--color-text-tertiary, #777777)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 0",
        color: "var(--color-text-tertiary, #777777)",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return `${String(value).slice(0, 16)}Z`;
}

function SourceStatusPanel({ sources }) {
  const sourceItems = sources?.sources
    ? Object.entries(sources.sources)
    : [];

  const overall = sources?.overall ?? "initializing";

  const overallColor = {
    ok: "#639922",
    degraded: "#BA7517",
    initializing: "#888888",
  }[overall] ?? "#888888";

  return (
    <div
      style={{
        background: "var(--color-background-primary, #ffffff)",
        border: "0.5px solid var(--color-border-tertiary, #dddddd)",
        borderRadius: 12,
        padding: "14px 18px",
        marginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 10,
          gap: 8,
        }}
      >
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: overallColor,
          }}
        />

        <div style={{ fontSize: 13, fontWeight: 500 }}>
          Data sources
        </div>

        <div
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: overallColor,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 500,
          }}
        >
          {overall}
        </div>
      </div>

      {!sourceItems.length ? (
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary, #777777)" }}>
          Waiting for source status...
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 8,
          }}
        >
          {sourceItems.map(([id, source]) => (
            <SourceRow key={id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceRow({ source }) {
  const status = source.status ?? "unknown";

  const color = {
    ok: "#639922",
    error: "#E24B4A",
    unknown: "#888888",
  }[status] ?? "#888888";

  return (
    <div
      style={{
        background: "var(--color-background-secondary, #f7f6f2)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />

        <div style={{ fontSize: 12, fontWeight: 500 }}>
          {source.name}
        </div>

        <div
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {status}
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary, #777777)",
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={source.url}
      >
        {source.url}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary, #777777)",
          marginTop: 4,
        }}
      >
        Last success: {source.last_success ? source.last_success.slice(0, 19) : "—"}
      </div>

      {source.last_error && (
        <div
          style={{
            fontSize: 11,
            color: "#A32D2D",
            marginTop: 4,
          }}
        >
          Error: {source.last_error}
        </div>
      )}
    </div>
  );
}

function MissionHero({ risk, sources }) {
  const level = risk?.overall_level ?? "nominal";
  const color = RISK_COLORS[level] ?? "#888";
  const sourceHealth = sources?.overall ?? "initializing";

  const sourceColor = {
    ok: "var(--accent-green)",
    degraded: "var(--accent-yellow)",
    initializing: "var(--text-soft)",
  }[sourceHealth] ?? "var(--text-soft)";

  return (
    <section
      className="card"
      style={{
        padding: 22,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 82% 30%, ${color}24, transparent 20rem)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
        <div>
          <div className="section-title">Current operational status</div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: `2px solid ${color}`,
                boxShadow: `0 0 32px ${color}55`,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                color,
              }}
            >
              {String(level).slice(0, 1).toUpperCase()}
            </div>

            <div>
              <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.04em" }}>
                {level.toUpperCase()}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 5 }}>
                Space weather operational risk level
              </div>
            </div>
          </div>

          <div style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7, maxWidth: 680 }}>
            Monitoring solar wind, geomagnetic activity, radio blackout conditions, solar radiation scales,
            official NOAA alerts and NASA DONKI solar event chains.
          </div>
        </div>

        <div
          style={{
            background: "rgba(7, 11, 18, 0.48)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div className="section-title">Systems health</div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Data sources</span>
            <span style={{ color: sourceColor, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
              {sourceHealth}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Risk engine</span>
            <span style={{ color: "var(--accent-green)", fontSize: 12, fontWeight: 800 }}>ONLINE</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Polling</span>
            <span style={{ color: "var(--accent-blue)", fontSize: 12, fontWeight: 800 }}>15s / 60s</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ForecastPanel({ forecast }) {
  if (!forecast) {
    return <EmptyState text="Generating operational forecast..." />;
  }

  const items = Array.isArray(forecast)
    ? forecast
    : forecast?.items ?? forecast?.events ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div className="section-title">Space weather forecast</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              CME arrival outlook
            </div>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <RiskBadge level={items.length ? "elevated" : "nominal"} />
          </div>
        </div>

        <div
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            marginTop: 14,
            color: "var(--text-muted)",
          }}
        >
          {forecast.summary ?? "No forecast summary available."}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--text-soft)",
          }}
        >
          Forecast items: {forecast.count ?? items.length}
        </div>
      </div>

      <Panel title={`Predicted CME arrivals (${items.length})`}>
        {!items.length ? (
          <EmptyState text="No CME forecast items available." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item, index) => (
              <ForecastCmeRow
                key={item.id ?? `${item.start_time}-${index}`}
                item={item}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ForecastSection({ section }) {
  const items = section.items ?? [];

  return (
    <div className="card card-pad">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div className="section-title" style={{ marginBottom: 0 }}>
          {section.title}
        </div>

        <RiskBadge level={section.severity ?? "nominal"} />
      </div>

      {!items.length ? (
        <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
          Nothing currently highlighted.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                borderTop:
                  index > 0 ? "1px solid var(--border-subtle)" : "none",
                paddingTop: index > 0 ? 8 : 0,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {item.label}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {item.value}
              </div>

              {item.description && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-soft)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </div>
              )}

              {item.source && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--accent-blue)",
                    marginTop: 5,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {item.source}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OperationalEventsPanel({ events }) {
  const items = Array.isArray(events)
    ? events
    : events?.items ?? events?.events ?? [];

  if (!events) {
    return <EmptyState text="Loading operational events..." />;
  }

  if (!items.length) {
    return (
      <Panel title="Operational events">
        <EmptyState text="No operational events available." />
      </Panel>
    );
  }

  return (
    <Panel title={`Operational events (${items.length})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((event, index) => (
          <OperationalEventRow
            key={event.id ?? event.activityID ?? `${event.type}-${index}`}
            event={normalizeEvent(event)}
          />
        ))}
      </div>
    </Panel>
  );
}

function OperationalEventRow({ event }) {
  const severity = event.severity ?? "info";

  const color =
    {
      info: "var(--text-soft)",
      nominal: "var(--accent-green)",
      elevated: "var(--accent-yellow)",
      high: "var(--accent-orange)",
      severe: "var(--accent-red)",
      extreme: "#991b1b",
    }[severity] ?? "var(--text-soft)";

  return (
    <div className="event-row">
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {severity}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-soft)",
            marginTop: 3,
          }}
        >
          {event.time ? String(event.time).slice(0, 16) : ""}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {event.title ?? "Untitled event"}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginTop: 4,
          }}
        >
          {event.summary ?? "No summary available."}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-soft)",
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {event.category ?? event.type ?? "event"}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--accent-blue)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 700,
          }}
        >
          {event.source ?? "Unknown source"}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-soft)",
            marginTop: 3,
          }}
        >
          {event.source_product ?? ""}
        </div>
      </div>
    </div>
  );
}

function ForecastCmeRow({ item }) {
  return (
    <div className="event-row">
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "var(--accent-yellow)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {item.confidence ?? "low"} confidence
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-soft)",
            marginTop: 3,
          }}
        >
          {item.start_time ? String(item.start_time).slice(0, 16) : ""}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {item.title ?? "Coronal Mass Ejection"}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginTop: 4,
          }}
        >
          Estimated arrival:{" "}
          <strong style={{ color: "var(--text-main)" }}>
            {item.estimated_arrival
              ? String(item.estimated_arrival).slice(0, 16)
              : "Unknown"}
          </strong>
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-soft)",
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Forecast item
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--accent-blue)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 700,
          }}
        >
          {item.source ?? "NASA DONKI"}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-soft)",
            marginTop: 3,
          }}
        >
          CME analysis
        </div>
      </div>
    </div>
  );
}

function normalizeEvent(event) {
  const type = event.type ?? event.event_type ?? "event";

  return {
    id: event.id ?? event.activityID ?? event.product_id,
    type,
    severity: event.severity ?? inferSeverity(event),
    title:
      event.title ??
      event.product_id ??
      event.class ??
      event.activityID ??
      readableType(type),
    summary:
      event.summary ??
      event.description ??
      event.message ??
      buildEventSummary(event),
    time:
      event.time ??
      event.start_time ??
      event.beginTime ??
      event.issue_time ??
      event.issue_datetime ??
      event.time_tag,
    source:
      event.source ??
      inferSource(event),
    source_product:
      event.source_product ??
      event.product ??
      event.product_id ??
      readableType(type),
    category:
      event.category ??
      readableType(type),
  };
}

function readableType(type) {
  const map = {
    FLR: "Solar flare",
    CME: "Coronal mass ejection",
    GST: "Geomagnetic storm",
    flare: "Solar flare",
    cme: "Coronal mass ejection",
    geomagnetic_storm: "Geomagnetic storm",
    alert: "Operational alert",
  };

  return map[type] ?? String(type ?? "event");
}

function inferSource(event) {
  if (event.source) return event.source;
  if (event.flrID || event.activityID || event.gstID || event.linkedEvents) return "NASA DONKI";
  if (event.product_id || event.message || event.issue_time) return "NOAA SWPC";
  return "Unknown source";
}

function inferSeverity(event) {
  const flareClass = event.class ?? event.classType;

  if (typeof flareClass === "string") {
    if (flareClass.startsWith("X")) return "high";
    if (flareClass.startsWith("M")) return "elevated";
    if (flareClass.startsWith("C")) return "info";
  }

  if (event.type === "CME" && event.speed >= 1000) return "elevated";
  if (event.g_scale >= 3 || event.kp_index >= 7) return "high";
  if (event.g_scale >= 1 || event.kp_index >= 5) return "elevated";

  return "info";
}

function buildEventSummary(event) {
  if (event.type === "CME" || event.speed) {
    const parts = [];

    if (event.speed) {
      parts.push(`Speed: ${Math.round(event.speed)} km/s.`);
    }

    if (event.estimated_arrival) {
      parts.push(`Estimated arrival: ${String(event.estimated_arrival).slice(0, 16)}.`);
    }

    if (event.is_earth_directed) {
      parts.push("Potentially Earth-directed.");
    }

    return parts.join(" ") || "CME event detected.";
  }

  if (event.type === "FLR" || event.class) {
    return `Solar flare ${event.class ?? ""} detected.`.trim();
  }

  if (event.type === "GST" || event.kp_index) {
    return `Geomagnetic storm event. Kp: ${event.kp_index ?? "unknown"}.`;
  }

  return JSON.stringify(event).slice(0, 240);
}
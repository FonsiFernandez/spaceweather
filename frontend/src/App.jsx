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

import SpaceWeatherVisualPanel from "./SpaceWeatherVisualPanel";
import HeliosphericPremiumPanel from "./HeliosphericPremiumPanel";

const API = "http://localhost:8000";
const POLL_MS = 15_000;

const RISK_COLORS = {
  nominal: "#639922",
  elevated: "#BA7517",
  high: "#D85A30",
  severe: "#E24B4A",
  extreme: "#A32D2D",
  info: "#38bdf8",
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
  const { data: chains } = useFetch("/events/chains", 30_000);
  const { data: alerts } = useFetch("/alerts");
  const { data: briefing } = useFetch("/briefing", 60_000);
  const { data: sources } = useFetch("/solar-wind/sources", 30_000);
  const { data: forecast, error: forecastError } = useFetch("/forecast", 60_000);
  const { data: operationalEvents } = useFetch("/events", 30_000);

  const [tab, setTab] = useState("overview");

  const level = risk?.overall_level ?? "nominal";
  const alertCount = getItems(alerts, ["items", "alerts"]).length;

  const impactItems = calculateOperationalImpacts(risk);
  const watchItems = getWatchConditions(risk, alerts, forecast);
  const briefingData = buildOperationalBriefing({
    risk,
    alerts,
    forecast,
    events: operationalEvents,
    impacts: impactItems,
    watches: watchItems,
  });

  return (
    <div className="app-shell">
      <Header level={level} risk={risk} />

      <main className="app-container">
        {(riskError || swError || forecastError) && (
          <div
            className="card card-pad"
            style={{
              borderColor: "rgba(239, 68, 68, 0.45)",
              color: "var(--accent-red)",
              marginBottom: 14,
            }}
          >
            Backend connection issue: {riskError || swError || forecastError}
          </div>
        )}

        <MissionHero
          risk={risk}
          sources={sources}
          briefing={briefingData}
        />

        <Tabs tab={tab} setTab={setTab} alertCount={alertCount} />

        {tab === "overview" && (
          <>
            <StatusBar risk={risk} />
            <OperationalBriefingCard briefing={briefingData} />
            <HeliosphericPremiumPanel
              risk={risk}
              forecast={forecast}
              events={operationalEvents}
            />
            <SpaceWeatherVisualPanel risk={risk} forecast={forecast} />
            <WatchConditionsPanel items={watchItems} />

            <div className="grid-2">
              <KpChart kp={kp} />
              <BzChart swHistory={swHistory} />
            </div>

            <SourceStatusPanel sources={sources} />
          </>
        )}

        {tab === "impacts" && (
          <>
            <OperationalImpactPanel impacts={impactItems} />
            <AssetMatrix risk={risk} />
          </>
        )}

        {tab === "forecast" && (
          <ForecastPanel forecast={forecast} risk={risk} />
        )}

        {tab === "events" && (
          <OperationalEventsPanel events={operationalEvents} />
        )}

        {tab === "chains" && (
          <CausalChains chains={chains} />
        )}

        {tab === "alerts" && (
          <AlertsPanel alerts={alerts} />
        )}

        {tab === "briefing" && (
          <BriefingPanel briefing={briefing ?? briefingData} fallbackBriefing={briefingData} />
        )}
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
          {risk ? `G${risk.g_scale ?? 0} / S${risk.s_scale ?? 0} / R${risk.r_scale ?? 0}` : "Connecting..."}
        </span>

        <RiskBadge level={level} />
      </div>
    </div>
  );
}

function Tabs({ tab, setTab, alertCount }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "impacts", label: "Impacts" },
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

function MissionHero({ risk, sources, briefing }) {
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

      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)",
          gap: 20,
        }}
      >
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
              <div
                style={{
                  fontSize: 34,
                  lineHeight: 1,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                }}
              >
                {level.toUpperCase()}
              </div>

              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 5 }}>
                Space weather operational risk level
              </div>
            </div>
          </div>

          <div style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7, maxWidth: 760 }}>
            This dashboard converts live space weather measurements into an operational assessment:
            what is happening, why it matters, what systems could be affected and what should be watched next.
          </div>

          <HelpBox title="Current assessment">
            {briefing.summary}
          </HelpBox>
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

          <HealthRow label="Data sources" value={sourceHealth} color={sourceColor} />
          <HealthRow label="Risk engine" value="ONLINE" color="var(--accent-green)" />
          <HealthRow label="Polling" value="15s / 60s" color="var(--accent-blue)" />
          <HealthRow label="Mode" value="Operational assistant" color="var(--accent-purple)" />
        </div>
      </div>
    </section>
  );
}

function HealthRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</span>
      <span
        style={{
          color,
          fontSize: 12,
          fontWeight: 800,
          textTransform: "uppercase",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function OperationalBriefingCard({ briefing }) {
  return (
    <section className="card card-pad" style={{ marginTop: 14 }}>
      <SectionHeader
        eyebrow="Operational briefing"
        title="What should I know right now?"
        description="This summary turns the raw indicators into a short operational interpretation."
        right={<RiskBadge level={briefing.level} />}
      />

      <div style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text-main)" }}>
        {briefing.summary}
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Panel title="Key findings">
          {briefing.keyFindings.length ? (
            <BulletList items={briefing.keyFindings} />
          ) : (
            <EmptyState text="No key findings available." compact />
          )}
        </Panel>

        <Panel title="Recommended actions">
          {briefing.actions.length ? (
            <BulletList items={briefing.actions} />
          ) : (
            <EmptyState text="No specific action required." compact />
          )}
        </Panel>
      </div>
    </section>
  );
}

function WatchConditionsPanel({ items }) {
  return (
    <section style={{ marginTop: 14 }}>
      <SectionHeader
        eyebrow="Watch conditions"
        title="What should be monitored next?"
        description="These are early-warning conditions derived from the current data. They help the dashboard act as a monitoring assistant instead of just a data display."
      />

      {!items.length ? (
        <div className="card card-pad">
          <RiskBadge level="nominal" />
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>
            No watch conditions are active. Current values do not suggest immediate operational concern.
          </div>
        </div>
      ) : (
        <div className="metric-grid">
          {items.map((item, index) => (
            <WatchCard key={`${item.title}-${index}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function WatchCard({ item }) {
  return (
    <div className="metric-card metric-card-explained">
      <div className="metric-card-header">
        <div>
          <div className="metric-label">Watch item</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-main)" }}>
            {item.title}
          </div>
        </div>

        <RiskBadge level={item.severity} />
      </div>

      <div className="metric-description">
        {item.description}
      </div>

      <div className="metric-interpretation">
        <strong>Next action:</strong> {item.action}
      </div>
    </div>
  );
}

function OperationalImpactPanel({ impacts }) {
  return (
    <section>
      <SectionHeader
        eyebrow="Operational impact assessment"
        title="Who or what could be affected?"
        description="This panel translates space weather indicators into practical risk for different operational domains."
      />

      <div className="metric-grid">
        {impacts.map((impact) => (
          <ImpactCard key={impact.domain} impact={impact} />
        ))}
      </div>
    </section>
  );
}

function ImpactCard({ impact }) {
  return (
    <div className="metric-card metric-card-explained">
      <div className="metric-card-header">
        <div>
          <div className="metric-label">Operational domain</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-main)" }}>
            {impact.domain}
          </div>
        </div>

        <RiskBadge level={impact.level} />
      </div>

      <div className="metric-description">
        <strong>Why:</strong> {impact.reason}
      </div>

      <div className="metric-description">
        <strong>Possible impact:</strong> {impact.possibleImpact}
      </div>

      <div className="metric-interpretation">
        <strong>Action:</strong> {impact.action}
      </div>
    </div>
  );
}

function StatusBar({ risk }) {
  const kp = risk?.kp_now;
  const bz = risk?.bz_now;
  const wind = risk?.wind_speed_now;
  const gScale = risk?.g_scale ?? 0;
  const sScale = risk?.s_scale ?? 0;
  const rScale = risk?.r_scale ?? 0;

  const metrics = [
    {
      label: "Kp index",
      value: kp !== undefined && kp !== null ? Number(kp).toFixed(1) : "—",
      sub: kp >= 5 ? "Geomagnetic storm conditions" : "Quiet or unsettled conditions",
      level: kp >= 7 ? "high" : kp >= 5 ? "elevated" : "nominal",
      description: "The Kp index measures global geomagnetic activity on a scale from 0 to 9.",
      interpretation:
        "Values below 5 are usually quiet. Kp 5 or higher means geomagnetic storm conditions may affect satellites, GNSS and power systems.",
    },
    {
      label: "IMF Bz",
      value: bz !== null && bz !== undefined ? `${Number(bz).toFixed(1)} nT` : "—",
      sub: bz < -10 ? "Southward magnetic field" : "Stable magnetic orientation",
      level: bz < -10 ? "elevated" : "nominal",
      description: "Bz is the north-south component of the interplanetary magnetic field.",
      interpretation:
        "Negative Bz values are more geoeffective. A strong southward Bz couples more efficiently with Earth's magnetosphere.",
    },
    {
      label: "Solar wind speed",
      value: wind ? `${Math.round(wind)} km/s` : "—",
      sub: wind > 600 ? "Fast solar wind stream" : "Normal solar wind speed",
      level: wind > 700 ? "high" : wind > 600 ? "elevated" : "nominal",
      description: "Solar wind speed indicates how fast charged particles are travelling from the Sun toward Earth.",
      interpretation:
        "Higher speeds can increase geomagnetic activity, especially when combined with negative Bz and increased density.",
    },
    {
      label: "G-scale",
      value: `G${gScale}`,
      sub: SCALE_LABELS[gScale] || "Quiet",
      level: gScale >= 3 ? "high" : gScale >= 1 ? "elevated" : "nominal",
      description: "NOAA G-scale describes geomagnetic storm intensity.",
      interpretation:
        "Higher G values indicate greater risk for satellite drag, GNSS degradation, aurora expansion and possible grid impacts.",
    },
    {
      label: "S-scale",
      value: `S${sScale}`,
      sub: SCALE_LABELS[sScale] || "None",
      level: sScale >= 3 ? "high" : sScale >= 1 ? "elevated" : "nominal",
      description: "NOAA S-scale describes solar radiation storm intensity.",
      interpretation:
        "Radiation storms can affect astronauts, polar aviation, satellite electronics and high-latitude operations.",
    },
    {
      label: "R-scale",
      value: `R${rScale}`,
      sub: SCALE_LABELS[rScale] || "None",
      level: rScale >= 3 ? "high" : rScale >= 1 ? "elevated" : "nominal",
      description: "NOAA R-scale describes radio blackout intensity caused by solar X-ray flares.",
      interpretation:
        "Higher R values may cause HF radio degradation, navigation issues and communications outages on the sunlit side of Earth.",
    },
  ];

  return (
    <section style={{ marginTop: 14 }}>
      <SectionHeader
        eyebrow="Live indicators"
        title="Current space weather conditions"
        description="These are the main physical and operational indicators used to interpret the current space weather situation."
      />

      <div className="metric-grid">
        {metrics.map((m) => (
          <MetricInfoCard key={m.label} {...m} />
        ))}
      </div>
    </section>
  );
}

function KpChart({ kp }) {
  const history = kp?.history ?? [];

  const data = history.slice(-24).map((d) => ({
    t: d.time_tag?.slice(11, 16) ?? "",
    kp: Number(d.kp ?? 0),
  }));

  return (
    <ChartCard
      title="Kp index — latest samples"
      description="The dashed line at Kp 5 marks the start of geomagnetic storm conditions. Kp 7 indicates strong storm conditions."
    >
      {data.length === 0 ? (
        <EmptyState text="Waiting for Kp data from NOAA SWPC..." compact />
      ) : (
        <ResponsiveContainer width="100%" height={160}>
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
    <ChartCard
      title="IMF Bz — latest samples"
      description="Negative Bz values are important because they allow stronger coupling between the solar wind and Earth's magnetic field."
    >
      {data.length === 0 ? (
        <EmptyState text="Waiting for IMF Bz data..." compact />
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#93a4b8" }} interval={9} />
            <YAxis tick={{ fontSize: 11, fill: "#93a4b8" }} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} nT`, "Bz"]} />
            <ReferenceLine y={0} stroke="#cccccc" />
            <ReferenceLine y={-10} stroke="#BA7517" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="bz" stroke="#818cf8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function ForecastPanel({ forecast, risk }) {
  if (!forecast) {
    return (
      <Panel title="Space weather forecast">
        <EmptyState text="Loading forecast data from backend..." />
      </Panel>
    );
  }

  const items = Array.isArray(forecast)
    ? forecast
    : forecast?.items ?? forecast?.events ?? [];

  const conditionOutlook = buildConditionBasedForecast(risk, forecast);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card card-pad">
        <SectionHeader
          eyebrow="Space weather forecast"
          title="Operational outlook"
          description="This forecast combines event-based CME arrivals when available with a condition-based outlook derived from current Kp, Bz, solar wind and NOAA scales."
          right={<RiskBadge level={items.length ? "elevated" : conditionOutlook.level} />}
        />

        <HelpBox title="Why this forecast can be useful even without CME events">
          If no CME arrivals are available, the dashboard still evaluates the current solar wind and
          geomagnetic state to estimate short-term operational concern.
        </HelpBox>

        <div className="forecast-summary">
          {items.length
            ? forecast.summary ?? "CME arrival estimates are available."
            : conditionOutlook.summary}
        </div>

        <div className="forecast-count">
          CME forecast items: {forecast.count ?? items.length}
        </div>
      </div>

      <Panel title="Condition-based outlook">
        <div className="metric-grid">
          <MetricInfoCard
            label="Next 6 hours"
            value={conditionOutlook.next6h.toUpperCase()}
            sub="Short-term operational outlook"
            level={conditionOutlook.next6h}
            description="Estimated from current Kp, Bz, solar wind speed and NOAA storm scales."
            interpretation={conditionOutlook.reasoning.join(" ")}
          />

          <MetricInfoCard
            label="Next 24 hours"
            value={conditionOutlook.next24h.toUpperCase()}
            sub="Monitoring outlook"
            level={conditionOutlook.next24h}
            description="This is not a physical propagation model. It is a rule-based operational interpretation."
            interpretation="Use this as a monitoring aid, not as an official forecast product."
          />
        </div>
      </Panel>

      <Panel title={`Predicted CME arrivals (${items.length})`}>
        {!items.length ? (
          <div>
            <InfoText>
              No CME arrival estimates are currently available. The backend is working,
              but no CME events have been stored yet. This does not mean space weather is impossible;
              it means there are no event-based CME arrivals to display.
            </InfoText>

            <EmptyState text="No CME events available for forecast generation." compact />
          </div>
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

function ForecastCmeRow({ item }) {
  const confidence = item.confidence ?? "low";

  const confidenceLevel = {
    high: "high",
    medium: "elevated",
    low: "nominal",
  }[String(confidence).toLowerCase()] ?? "nominal";

  return (
    <div className="event-row">
      <div>
        <RiskBadge level={confidenceLevel} />

        <div className="event-time">
          Start: {item.start_time ? String(item.start_time).slice(0, 16) : "Unknown"}
        </div>
      </div>

      <div>
        <div className="event-title">
          {item.title ?? "Coronal Mass Ejection"}
        </div>

        <div className="event-summary">
          A CME is a large eruption of plasma and magnetic field from the Sun.
          If Earth-directed, it may trigger geomagnetic activity after arrival.
        </div>

        <div className="event-detail-grid">
          <div>
            <span>Estimated arrival</span>
            <strong>
              {item.estimated_arrival
                ? String(item.estimated_arrival).slice(0, 16)
                : "Unknown"}
            </strong>
          </div>

          <div>
            <span>Confidence</span>
            <strong>{confidence}</strong>
          </div>
        </div>
      </div>

      <div className="event-source">
        <div>{item.source ?? "NASA DONKI"}</div>
        <span>CME analysis</span>
      </div>
    </div>
  );
}

function OperationalEventsPanel({ events }) {
  const items = getItems(events, ["items", "events"]);

  if (!events) {
    return <EmptyState text="Loading operational events..." />;
  }

  if (!items.length) {
    return (
      <Panel title="Operational events">
        <InfoText>
          This panel shows relevant solar and geomagnetic events detected from external sources.
          Events can include solar flares, CMEs, geomagnetic storms and operational alert products.
        </InfoText>
        <EmptyState text="No operational events available." compact />
      </Panel>
    );
  }

  return (
    <Panel title={`Operational events (${items.length})`}>
      <InfoText>
        These events are normalized from different data providers. Severity is inferred from
        available properties such as flare class, CME speed, Kp index or NOAA alert type.
      </InfoText>

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

        <div className="event-time">
          {event.time ? String(event.time).slice(0, 16) : ""}
        </div>
      </div>

      <div>
        <div className="event-title">
          {event.title ?? "Untitled event"}
        </div>

        <div className="event-summary">
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

      <div className="event-source">
        <div>{event.source ?? "Unknown source"}</div>
        <span>{event.source_product ?? ""}</span>
      </div>
    </div>
  );
}

function AlertsPanel({ alerts }) {
  const items = getItems(alerts, ["items", "alerts"]);

  if (!items.length) {
    return (
      <Panel title="NOAA SWPC alerts">
        <InfoText>
          Alerts, watches and warnings will appear here when the backend receives active NOAA products.
        </InfoText>
        <EmptyState text="No active alerts from NOAA SWPC." compact />
      </Panel>
    );
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
            className="card card-pad"
            style={{
              borderColor: `${SEV_COLOR[String(severity).toLowerCase()] ?? "#888888"}55`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: SEV_COLOR[String(severity).toLowerCase()] ?? "#888888",
                }}
              >
                {severity}
              </span>

              <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                {issueTime ? `${String(issueTime).slice(0, 16)}Z` : ""}
              </span>
            </div>

            <InfoText>
              {explainAlertPlainEnglish(a)}
            </InfoText>

            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                maxHeight: 160,
                overflow: "auto",
              }}
            >
              {String(message).slice(0, 600)}
              {String(message).length > 600 ? "…" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BriefingPanel({ briefing, fallbackBriefing }) {
  const level = briefing?.level ?? briefing?.overall_risk ?? fallbackBriefing?.level ?? "nominal";
  const actions = briefing?.recommended_actions ?? briefing?.actions ?? fallbackBriefing?.actions ?? [];
  const topAsset = briefing?.top_risk_asset;
  const summary = briefing?.summary ?? fallbackBriefing?.summary ?? "No briefing summary available.";
  const keyFindings = briefing?.key_findings ?? briefing?.keyFindings ?? fallbackBriefing?.keyFindings ?? [];

  return (
    <div>
      <SectionHeader
        eyebrow="Mission briefing"
        title="Operational summary"
        description="This view can use the backend briefing if available. Otherwise it falls back to the frontend rule-based briefing."
        right={<RiskBadge level={level} />}
      />

      <Panel title="Executive summary">
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          {summary}
        </div>
      </Panel>

      <Panel title="Key findings">
        {keyFindings.length ? (
          <BulletList items={keyFindings} />
        ) : (
          <EmptyState text="No key findings available." compact />
        )}
      </Panel>

      <Panel title="Recommended actions">
        {actions.length ? (
          <BulletList items={actions} />
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-soft)" }}>
            No specific actions required.
          </div>
        )}
      </Panel>

      {topAsset && (
        <Panel title="Top affected asset">
          <div style={{ fontSize: 14, fontWeight: 700 }}>{topAsset.asset_name}</div>
          <div style={{ marginTop: 8 }}>
            <RiskBadge level={topAsset.risk_level} />
          </div>
        </Panel>
      )}
    </div>
  );
}

function CausalChains({ chains }) {
  const items = getItems(chains, ["items", "chains"]);

  if (!items.length) {
    return (
      <Panel title="Causal chains">
        <InfoText>
          Causal chains explain how solar events can evolve into operational impact:
          flare → CME → solar wind disturbance → geomagnetic storm → affected systems.
        </InfoText>
        <EmptyState text="No causal chains available yet. DONKI ingestion can be connected next." compact />
      </Panel>
    );
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
    <div className="card card-pad">
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: statusColor,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {String(status).replace("_", " ")}
        </span>

        {chain.total_transit_hours && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
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
        background: "rgba(7, 11, 18, 0.42)",
        border: `${dashed ? "1.5px dashed" : "1px solid"} ${color}`,
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <span style={{ color: "var(--text-soft)", fontSize: 16 }}>
      →
    </span>
  );
}

function AssetMatrix({ risk }) {
  const assets = risk?.assets ?? [];

  return (
    <section style={{ marginTop: 16 }}>
      <SectionHeader
        eyebrow="Asset risk matrix"
        title="Asset-specific risk"
        description="If the backend provides asset-level assessments, they are shown here with drivers and first recommended mitigation."
      />

      {!assets.length ? (
        <div className="card card-pad">
          <EmptyState text="Waiting for asset-level risk assessment..." compact />
        </div>
      ) : (
        <div className="metric-grid">
          {assets.map((a) => (
            <div
              key={a.asset_id}
              className="metric-card metric-card-explained"
              style={{
                borderColor: `${RISK_COLORS[a.risk_level] ?? "var(--border-subtle)"}`,
              }}
            >
              <div className="metric-card-header">
                <div style={{ fontSize: 14, fontWeight: 800 }}>{a.asset_name}</div>
                <RiskBadge level={a.risk_level} />
              </div>

              <div className="metric-description">
                {(a.drivers ?? []).slice(0, 3).map((d, i) => (
                  <div key={i}>• {d}</div>
                ))}
              </div>

              {(a.mitigations ?? [])[0] && (
                <div className="metric-interpretation">
                  <strong>Action:</strong> {a.mitigations[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
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
    <section style={{ marginTop: 14 }}>
      <SectionHeader
        eyebrow="Data source health"
        title="External data availability"
        description="This shows whether the backend can currently reach and update the external data sources used by the dashboard."
      />

      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: overallColor,
            }}
          />

          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Data sources
          </div>

          <div
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: overallColor,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 800,
            }}
          >
            {overall}
          </div>
        </div>

        {!sourceItems.length ? (
          <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
            Waiting for source status...
          </div>
        ) : (
          <div className="source-grid">
            {sourceItems.map(([id, source]) => (
              <SourceRow key={id} source={source} />
            ))}
          </div>
        )}
      </div>
    </section>
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
    <div className="source-row">
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

        <div className="source-name">
          {source.name}
        </div>

        <div
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color,
            textTransform: "uppercase",
            fontWeight: 800,
          }}
        >
          {status}
        </div>
      </div>

      <div className="source-url" title={source.url}>
        {source.url}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 4 }}>
        Last success: {source.last_success ? source.last_success.slice(0, 19) : "—"}
      </div>

      {source.last_error && (
        <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 4 }}>
          Error: {source.last_error}
        </div>
      )}
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

function ChartCard({ title, description, children }) {
  return (
    <div className="card card-pad">
      <div className="section-title">{title}</div>

      {description && (
        <InfoText>
          {description}
        </InfoText>
      )}

      {children}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="card card-pad">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ text, compact = false }) {
  return (
    <div className="empty-state" style={{ padding: compact ? "18px 0" : undefined }}>
      {text}
    </div>
  );
}

function InfoText({ children }) {
  return (
    <p className="info-text">
      {children}
    </p>
  );
}

function HelpBox({ title, children }) {
  return (
    <div className="help-box">
      <div className="help-box-title">{title}</div>
      <div className="help-box-body">{children}</div>
    </div>
  );
}

function MetricInfoCard({ label, value, sub, description, interpretation, level }) {
  return (
    <div className="metric-card metric-card-explained">
      <div className="metric-card-header">
        <div>
          <div className="metric-label">{label}</div>
          <div className="metric-value">{value}</div>
        </div>

        {level && <RiskBadge level={level} />}
      </div>

      <div className="metric-sub">{sub}</div>

      {description && (
        <div className="metric-description">
          {description}
        </div>
      )}

      {interpretation && (
        <div className="metric-interpretation">
          <strong>Meaning:</strong> {interpretation}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, right }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <div className="section-title">{eyebrow}</div>}
        <h2 className="section-heading">{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>

      {right && (
        <div className="section-header-right">
          {right}
        </div>
      )}
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function getItems(value, keys = []) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return [];
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return `${String(value).slice(0, 16)}Z`;
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

function explainAlertPlainEnglish(alert) {
  const raw = String(
    alert.message ||
    alert.description ||
    alert.summary ||
    alert.product_id ||
    ""
  ).toUpperCase();

  if (raw.includes("G1") || raw.includes("GEOMAGNETIC")) {
    return "Plain English: this product relates to geomagnetic activity. Possible effects include satellite drag changes, GNSS disturbance and aurora expansion.";
  }

  if (raw.includes("R1") || raw.includes("R2") || raw.includes("RADIO BLACKOUT")) {
    return "Plain English: this product relates to radio blackout conditions. Possible effects include HF communication degradation on the sunlit side of Earth.";
  }

  if (raw.includes("S1") || raw.includes("S2") || raw.includes("RADIATION")) {
    return "Plain English: this product relates to solar radiation conditions. Possible effects include radiation exposure concerns for high-altitude or space operations.";
  }

  return "Plain English: this is an operational alert product. Review the original message and monitor the affected scale or system.";
}

function calculateOperationalImpacts(risk) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);

  return [
    {
      domain: "Satellite operations",
      level: g >= 3 || kp >= 7 ? "high" : kp >= 5 || wind > 650 ? "elevated" : "nominal",
      reason: "Based on geomagnetic activity, Kp index and solar wind speed.",
      possibleImpact: "Increased atmospheric drag, attitude disturbances, charging risk or operational constraints.",
      action: g >= 3 ? "Review spacecraft operations and postpone sensitive manoeuvres if needed." : "Continue routine monitoring.",
    },
    {
      domain: "GNSS / navigation",
      level: g >= 2 || kp >= 6 ? "elevated" : "nominal",
      reason: "Geomagnetic storms can disturb ionospheric conditions.",
      possibleImpact: "Reduced positioning accuracy, scintillation or degraded high-precision navigation.",
      action: g >= 2 ? "Warn users relying on high-precision GNSS." : "No immediate action required.",
    },
    {
      domain: "HF communications",
      level: r >= 2 ? "high" : r >= 1 ? "elevated" : "nominal",
      reason: "Radio blackout scale is driven by solar X-ray flare activity.",
      possibleImpact: "HF degradation or blackout on the sunlit side of Earth.",
      action: r >= 1 ? "Check alternative communication paths." : "Normal operations.",
    },
    {
      domain: "Radiation exposure",
      level: s >= 2 ? "high" : s >= 1 ? "elevated" : "nominal",
      reason: "Solar radiation storm scale indicates energetic particle risk.",
      possibleImpact: "Potential impact to astronauts, high-altitude aviation, polar flights and satellite electronics.",
      action: s >= 1 ? "Monitor radiation products and polar aviation exposure." : "No specific action.",
    },
    {
      domain: "Power grid",
      level: g >= 4 ? "high" : g >= 2 ? "elevated" : "nominal",
      reason: "Strong geomagnetic storms can induce currents in long conductors.",
      possibleImpact: "Geomagnetically induced currents in vulnerable infrastructure.",
      action: g >= 3 ? "Notify grid operators or internal stakeholders." : "No grid action required.",
    },
    {
      domain: "Aurora visibility",
      level: kp >= 7 ? "high" : kp >= 5 ? "elevated" : "nominal",
      reason: "Auroral oval expansion is strongly related to geomagnetic activity.",
      possibleImpact: "Aurora may become visible farther from polar regions.",
      action: kp >= 5 ? "Check local aurora visibility maps and cloud conditions." : "Aurora unlikely at mid-latitudes.",
    },
  ];
}

function getWatchConditions(risk, alerts, forecast) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);
  const alertItems = getItems(alerts, ["items", "alerts"]);
  const forecastItems = getItems(forecast, ["items", "events"]);

  const watches = [];

  if (kp >= 4.5 && kp < 5) {
    watches.push({
      title: "Kp close to storm threshold",
      severity: "elevated",
      description: "Kp is approaching 5, the threshold for G1 geomagnetic storm conditions.",
      action: "Monitor the next Kp updates and check whether G-scale increases.",
    });
  }

  if (kp >= 5) {
    watches.push({
      title: "Geomagnetic storm conditions",
      severity: kp >= 7 ? "high" : "elevated",
      description: "Kp is at or above 5, indicating geomagnetic storm conditions.",
      action: "Review impacts to satellites, GNSS and aurora visibility.",
    });
  }

  if (bz <= -8) {
    watches.push({
      title: "Southward IMF Bz",
      severity: bz <= -12 ? "high" : "elevated",
      description: "Sustained negative Bz can increase coupling between the solar wind and Earth's magnetosphere.",
      action: "Watch for a delayed increase in Kp and geomagnetic response.",
    });
  }

  if (wind >= 600) {
    watches.push({
      title: "Elevated solar wind speed",
      severity: wind >= 750 ? "high" : "elevated",
      description: "Fast solar wind can increase geomagnetic activity, especially when Bz is negative.",
      action: "Monitor Bz direction and density together with speed.",
    });
  }

  if (g >= 1) {
    watches.push({
      title: `NOAA geomagnetic scale G${g}`,
      severity: g >= 3 ? "high" : "elevated",
      description: "NOAA G-scale indicates geomagnetic storm conditions.",
      action: "Review operational domains affected by geomagnetic activity.",
    });
  }

  if (s >= 1) {
    watches.push({
      title: `NOAA radiation scale S${s}`,
      severity: s >= 3 ? "high" : "elevated",
      description: "NOAA S-scale indicates solar radiation storm conditions.",
      action: "Monitor radiation-sensitive operations.",
    });
  }

  if (r >= 1) {
    watches.push({
      title: `NOAA radio blackout scale R${r}`,
      severity: r >= 3 ? "high" : "elevated",
      description: "NOAA R-scale indicates radio blackout conditions.",
      action: "Check communication paths and affected sunlit regions.",
    });
  }

  if (alertItems.length) {
    watches.push({
      title: "Active alert products",
      severity: "elevated",
      description: `${alertItems.length} alert/watch product(s) are available from the backend.`,
      action: "Review the Alerts tab for the original product messages.",
    });
  }

  if (forecastItems.length) {
    watches.push({
      title: "CME arrival forecast available",
      severity: "elevated",
      description: `${forecastItems.length} CME forecast item(s) are available.`,
      action: "Review estimated arrival time and confidence.",
    });
  }

  return watches;
}

function buildOperationalBriefing({ risk, alerts, forecast, events, impacts, watches }) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = risk?.bz_now;
  const wind = risk?.wind_speed_now;
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);
  const level = risk?.overall_level ?? inferOverallLevelFromInputs(risk);

  const alertItems = getItems(alerts, ["items", "alerts"]);
  const forecastItems = getItems(forecast, ["items", "events"]);
  const eventItems = getItems(events, ["items", "events"]);

  const highImpacts = impacts.filter((i) => i.level === "high" || i.level === "severe" || i.level === "extreme");
  const elevatedImpacts = impacts.filter((i) => i.level === "elevated");

  const keyFindings = [];

  if (kp >= 5) {
    keyFindings.push(`Kp is ${kp.toFixed(1)}, which is at or above the geomagnetic storm threshold.`);
  } else {
    keyFindings.push(`Kp is ${kp.toFixed(1)}, below the geomagnetic storm threshold.`);
  }

  if (bz !== null && bz !== undefined) {
    keyFindings.push(
      Number(bz) < -10
        ? `IMF Bz is strongly southward at ${Number(bz).toFixed(1)} nT, increasing geoeffectiveness.`
        : `IMF Bz is ${Number(bz).toFixed(1)} nT and not strongly southward.`
    );
  }

  if (wind !== null && wind !== undefined) {
    keyFindings.push(
      Number(wind) > 600
        ? `Solar wind speed is elevated at about ${Math.round(Number(wind))} km/s.`
        : `Solar wind speed is about ${Math.round(Number(wind))} km/s.`
    );
  }

  if (g || s || r) {
    keyFindings.push(`Current NOAA scales are G${g}, S${s}, R${r}.`);
  } else {
    keyFindings.push("NOAA G/S/R scales do not currently indicate significant storm conditions.");
  }

  if (forecastItems.length) {
    keyFindings.push(`${forecastItems.length} CME forecast item(s) are available.`);
  } else {
    keyFindings.push("No CME arrival forecast items are currently available.");
  }

  if (alertItems.length) {
    keyFindings.push(`${alertItems.length} alert/watch product(s) are currently available.`);
  }

  const actions = [];

  if (highImpacts.length) {
    actions.push("Review high-risk operational domains and consider mitigation before sensitive operations.");
  }

  if (elevatedImpacts.length) {
    actions.push(`Monitor elevated domains: ${elevatedImpacts.map((i) => i.domain).join(", ")}.`);
  }

  if (watches.length) {
    actions.push("Review active watch conditions and follow the next measurements for trend confirmation.");
  }

  if (!actions.length) {
    actions.push("Continue routine monitoring. No immediate operational action is required.");
  }

  const summary =
    level === "nominal"
      ? "Current space weather conditions appear operationally quiet. No significant impact is expected, but the dashboard will continue monitoring Kp, Bz, solar wind speed, NOAA alerts and CME forecasts."
      : `Current space weather conditions are ${level}. Some operational domains may require monitoring or mitigation depending on mission sensitivity.`;

  return {
    level,
    summary,
    keyFindings,
    actions,
    eventCount: eventItems.length,
    alertCount: alertItems.length,
    forecastCount: forecastItems.length,
  };
}

function buildConditionBasedForecast(risk, forecast) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);
  const forecastItems = getItems(forecast, ["items", "events"]);

  let level = "nominal";
  const reasoning = [];

  if (forecastItems.length) {
    level = "elevated";
    reasoning.push("Event-based CME forecast items are available.");
  }

  if (kp >= 5 || g >= 1) {
    level = maxRisk(level, "elevated");
    reasoning.push("Geomagnetic activity is at or above storm threshold.");
  } else {
    reasoning.push("Kp is below geomagnetic storm threshold.");
  }

  if (bz <= -10) {
    level = maxRisk(level, "elevated");
    reasoning.push("IMF Bz is strongly southward, increasing geoeffectiveness.");
  } else {
    reasoning.push("IMF Bz is not strongly southward.");
  }

  if (wind >= 650) {
    level = maxRisk(level, "elevated");
    reasoning.push("Solar wind speed is elevated.");
  }

  if (s >= 2 || r >= 2 || g >= 3 || kp >= 7) {
    level = maxRisk(level, "high");
    reasoning.push("One or more NOAA scales or geomagnetic indicators are high.");
  }

  const summary =
    level === "nominal"
      ? "No CME arrivals are currently available and present conditions suggest nominal short-term operational risk."
      : "Current conditions suggest elevated monitoring value even if no confirmed CME arrival forecast is available.";

  return {
    level,
    next6h: level,
    next24h: forecastItems.length ? "elevated" : level,
    summary,
    reasoning,
  };
}

function inferOverallLevelFromInputs(risk) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);

  if (g >= 4 || s >= 4 || r >= 4 || kp >= 8) return "severe";
  if (g >= 3 || s >= 3 || r >= 3 || kp >= 7) return "high";
  if (g >= 1 || s >= 1 || r >= 1 || kp >= 5 || bz <= -10 || wind >= 650) return "elevated";

  return "nominal";
}

function maxRisk(a, b) {
  const order = ["nominal", "elevated", "high", "severe", "extreme"];
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}
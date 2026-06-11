import React from "react";

function getVisualState(risk, forecast) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const forecastItems = Array.isArray(forecast)
    ? forecast
    : forecast?.items ?? forecast?.events ?? [];

  const hasCme = forecastItems.length > 0;

  if (g >= 3 || kp >= 7) {
    return {
      level: "storm",
      title: "Geomagnetic storm conditions",
      subtitle: "Strong aurora activity is possible and operational monitoring is recommended.",
      auroraText: "High aurora chance",
    };
  }

  if (hasCme || g >= 1 || kp >= 5 || bz <= -10 || wind >= 600) {
    return {
      level: "active",
      title: "Elevated solar activity",
      subtitle: "Conditions are more active than usual. Aurora may be possible at high latitudes.",
      auroraText: "Possible aurora",
    };
  }

  return {
    level: "quiet",
    title: "Quiet space weather",
    subtitle: "No significant geomagnetic activity is currently expected.",
    auroraText: "Low aurora chance",
  };
}

export default function SpaceWeatherVisualPanel({ risk, forecast }) {
  const visual = getVisualState(risk, forecast);

  const kp = risk?.kp_now ?? "—";
  const bz = risk?.bz_now ?? "—";
  const wind = risk?.wind_speed_now ? `${Math.round(risk.wind_speed_now)} km/s` : "—";

  const isQuiet = visual.level === "quiet";
  const isActive = visual.level === "active";
  const isStorm = visual.level === "storm";

  return (
    <section className="card card-pad" style={{ marginTop: 14, overflow: "hidden" }}>
      <div className="section-title">Visual overview</div>

      <div className="visual-panel">
        <div className={`visual-scene ${visual.level}`}>
          <div className="visual-label visual-label-sun">Sun</div>
          <div className="visual-label visual-label-earth">Earth</div>

          <svg
            className="visual-svg"
            viewBox="0 0 900 320"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffd76a" />
                <stop offset="60%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f97316" />
              </radialGradient>

              <radialGradient id="earthGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </radialGradient>

              <linearGradient id="auroraGreen" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(34,197,94,0)" />
                <stop offset="50%" stopColor="rgba(34,197,94,0.9)" />
                <stop offset="100%" stopColor="rgba(34,197,94,0)" />
              </linearGradient>

              <linearGradient id="auroraPurple" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(129,140,248,0)" />
                <stop offset="50%" stopColor="rgba(129,140,248,0.75)" />
                <stop offset="100%" stopColor="rgba(129,140,248,0)" />
              </linearGradient>
            </defs>

            {/* Background glow */}
            <rect x="0" y="0" width="900" height="320" fill="transparent" />

            {/* Sun */}
            <circle cx="135" cy="160" r="46" fill="url(#sunGlow)" className="sun-core" />
            <circle cx="135" cy="160" r="70" className="sun-halo" />

            {/* Solar wind lines */}
            <path d="M220 120 C320 120, 420 120, 520 120 C620 120, 690 130, 735 145" className="wind-line wind-line-1" />
            <path d="M220 160 C320 160, 420 160, 520 160 C620 160, 690 165, 735 165" className="wind-line wind-line-2" />
            <path d="M220 200 C320 200, 420 200, 520 200 C620 200, 690 195, 735 185" className="wind-line wind-line-3" />

            {/* Optional CME cloud */}
            {(isActive || isStorm) && (
              <ellipse
                cx="350"
                cy="160"
                rx={isStorm ? "72" : "48"}
                ry={isStorm ? "42" : "28"}
                className={`cme-cloud ${isStorm ? "storm" : "active"}`}
              />
            )}

            {/* Magnetosphere */}
            <path
              d="M735 88
                 C800 78, 845 100, 855 140
                 C860 160, 860 160, 855 180
                 C845 220, 800 242, 735 232"
              className={`magnetosphere ${isStorm ? "storm" : isActive ? "active" : "quiet"}`}
            />

            {/* Earth */}
            <circle cx="735" cy="160" r="34" fill="url(#earthGlow)" className="earth-core" />

            {/* Aurora */}
            {(isActive || isStorm) && (
              <>
                <path
                  d="M695 120 C715 100, 755 100, 775 120"
                  stroke="url(#auroraGreen)"
                  strokeWidth={isStorm ? "10" : "7"}
                  fill="none"
                  strokeLinecap="round"
                  className="aurora-wave aurora-wave-top"
                />
                <path
                  d="M695 200 C715 220, 755 220, 775 200"
                  stroke="url(#auroraGreen)"
                  strokeWidth={isStorm ? "10" : "7"}
                  fill="none"
                  strokeLinecap="round"
                  className="aurora-wave aurora-wave-bottom"
                />
              </>
            )}

            {isStorm && (
              <>
                <path
                  d="M690 112 C715 88, 755 88, 780 112"
                  stroke="url(#auroraPurple)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  className="aurora-wave aurora-wave-top"
                />
                <path
                  d="M690 208 C715 232, 755 232, 780 208"
                  stroke="url(#auroraPurple)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  className="aurora-wave aurora-wave-bottom"
                />
              </>
            )}
          </svg>

          <div className="visual-overlay">
            <div className={`visual-state-pill ${visual.level}`}>
              {visual.level.toUpperCase()}
            </div>

            <div className="visual-copy">
              <h3>{visual.title}</h3>
              <p>{visual.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="visual-side-info">
          <div className="visual-side-card">
            <div className="visual-side-label">Aurora</div>
            <div className="visual-side-value">{visual.auroraText}</div>
            <div className="visual-side-sub">
              Based mainly on Kp, geomagnetic activity and general solar conditions.
            </div>
          </div>

          <div className="visual-side-card">
            <div className="visual-side-label">Live values</div>
            <div className="visual-stat-list">
              <div><span>Kp</span><strong>{Number(kp).toFixed ? Number(kp).toFixed(1) : kp}</strong></div>
              <div><span>Bz</span><strong>{bz !== "—" ? `${Number(bz).toFixed(1)} nT` : "—"}</strong></div>
              <div><span>Wind</span><strong>{wind}</strong></div>
            </div>
          </div>

          <div className="visual-side-card">
            <div className="visual-side-label">What this means</div>
            <div className="visual-side-sub">
              This simplified view helps users understand how solar activity can interact with Earth's magnetosphere and increase aurora visibility.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
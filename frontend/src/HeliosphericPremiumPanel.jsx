import React, { useMemo } from "react";

function getItems(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function hasSolarFlare(events) {
  return events.some((e) => {
    const type = String(e?.type ?? e?.event_type ?? "").toUpperCase();
    const flareClass = String(e?.class ?? e?.classType ?? "");
    return type === "FLR" || type === "FLARE" || flareClass.startsWith("C") || flareClass.startsWith("M") || flareClass.startsWith("X");
  });
}

function getFlareStrength(events) {
  let strength = "none";

  for (const e of events) {
    const flareClass = String(e?.class ?? e?.classType ?? "");
    if (flareClass.startsWith("X")) return "extreme";
    if (flareClass.startsWith("M")) strength = strength === "extreme" ? "extreme" : "high";
    if (flareClass.startsWith("C") && strength === "none") strength = "moderate";
  }

  return strength;
}

function inferCmeState(forecast, events) {
  const forecastItems = getItems(forecast, ["items", "events"]);
  const cmeEvents = events.filter((e) => {
    const type = String(e?.type ?? e?.event_type ?? "").toUpperCase();
    return type === "CME" || type.includes("CME") || e?.speed != null;
  });

  if (forecastItems.length > 0) {
    return {
      hasCme: true,
      incoming: true,
      count: forecastItems.length,
      label: `${forecastItems.length} incoming CME${forecastItems.length > 1 ? "s" : ""}`,
    };
  }

  if (cmeEvents.length > 0) {
    return {
      hasCme: true,
      incoming: false,
      count: cmeEvents.length,
      label: `${cmeEvents.length} CME event${cmeEvents.length > 1 ? "s" : ""}`,
    };
  }

  return {
    hasCme: false,
    incoming: false,
    count: 0,
    label: "No CME event",
  };
}

function inferVisualMode(risk, forecast, events) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);

  const flarePresent = hasSolarFlare(events);
  const flareStrength = getFlareStrength(events);
  const cme = inferCmeState(forecast, events);

  if (g >= 3 || kp >= 7 || s >= 3 || r >= 3) {
    return {
      level: "storm",
      title: "Storm-driven heliospheric activity",
      subtitle:
        "Solar-terrestrial coupling is strong enough to justify close monitoring of geomagnetic and operational effects.",
      auroraText: "Strong aurora chance",
      flareStrength,
      cme,
      flarePresent,
    };
  }

  if (cme.hasCme || flarePresent || g >= 1 || kp >= 5 || bz <= -10 || wind >= 600 || s >= 1 || r >= 1) {
    return {
      level: "active",
      title: "Elevated solar activity",
      subtitle:
        "Solar activity is enhanced. Watch CME development, solar wind conditions and possible geomagnetic response.",
      auroraText: "Possible aurora",
      flareStrength,
      cme,
      flarePresent,
    };
  }

  return {
    level: "quiet",
    title: "Quiet heliospheric conditions",
    subtitle:
      "Solar and geomagnetic conditions appear calm. No major operational or auroral enhancement is currently indicated.",
    auroraText: "Low aurora chance",
    flareStrength,
    cme,
    flarePresent,
  };
}

function formatWind(value) {
  return value ? `${Math.round(value)} km/s` : "—";
}

function formatBz(value) {
  return value !== null && value !== undefined ? `${Number(value).toFixed(1)} nT` : "—";
}

function formatKp(value) {
  return value !== null && value !== undefined ? Number(value).toFixed(1) : "—";
}

function getActivityBullets(risk, forecast, events) {
  const kp = Number(risk?.kp_now ?? 0);
  const bz = Number(risk?.bz_now ?? 0);
  const wind = Number(risk?.wind_speed_now ?? 0);
  const g = Number(risk?.g_scale ?? 0);
  const s = Number(risk?.s_scale ?? 0);
  const r = Number(risk?.r_scale ?? 0);

  const cme = inferCmeState(forecast, events);
  const flare = getFlareStrength(events);

  const bullets = [];

  bullets.push(
    kp >= 5
      ? `Geomagnetic activity is elevated with Kp ${kp.toFixed(1)}.`
      : `Geomagnetic activity remains below storm threshold with Kp ${kp.toFixed(1)}.`
  );

  bullets.push(
    bz <= -10
      ? `IMF Bz is strongly southward at ${bz.toFixed(1)} nT, increasing geoeffectiveness.`
      : `IMF Bz is ${bz.toFixed(1)} nT and not strongly southward.`
  );

  bullets.push(
    wind >= 600
      ? `Solar wind speed is elevated at ${Math.round(wind)} km/s.`
      : `Solar wind speed is ${Math.round(wind)} km/s.`
  );

  bullets.push(
    cme.hasCme
      ? `${cme.label} ${cme.incoming ? "is influencing the forecast view." : "has been detected in the event stream."}`
      : "No CME event is currently present in the available data."
  );

  bullets.push(
    flare === "extreme"
      ? "A strong flare signature is present."
      : flare === "high"
        ? "Moderate-to-strong flare activity is present."
        : flare === "moderate"
          ? "Minor flare activity is present."
          : "No notable flare activity is currently present."
  );

  bullets.push(`NOAA scales currently read G${g} / S${s} / R${r}.`);

  return bullets;
}

export default function HeliosphericPremiumPanel({ risk, forecast, events }) {
  const eventItems = useMemo(() => getItems(events, ["items", "events"]), [events]);
  const visual = useMemo(() => inferVisualMode(risk, forecast, eventItems), [risk, forecast, eventItems]);
  const bullets = useMemo(() => getActivityBullets(risk, forecast, eventItems), [risk, forecast, eventItems]);

  const kp = formatKp(risk?.kp_now);
  const bz = formatBz(risk?.bz_now);
  const wind = formatWind(risk?.wind_speed_now);

  const flareBadge =
    visual.flareStrength === "extreme"
      ? "Extreme flare"
      : visual.flareStrength === "high"
        ? "Strong flare"
        : visual.flareStrength === "moderate"
          ? "Minor flare"
          : "No flare";

  return (
    <section className="card card-pad" style={{ marginTop: 14, overflow: "hidden" }}>
      <div className="section-title">Heliospheric visual overview</div>

      <div className="helio-panel">
        <div className={`helio-scene ${visual.level}`}>
          <div className="helio-scene-header">
            <div className={`helio-state-pill ${visual.level}`}>
              {visual.level.toUpperCase()}
            </div>

            <div className="helio-badges">
              <span className={`helio-mini-badge ${visual.cme.hasCme ? "on" : ""}`}>
                {visual.cme.hasCme ? "CME" : "NO CME"}
              </span>
              <span className={`helio-mini-badge ${visual.flarePresent ? "on" : ""}`}>
                {flareBadge}
              </span>
              <span className={`helio-mini-badge ${visual.level !== "quiet" ? "on" : ""}`}>
                {visual.auroraText}
              </span>
            </div>
          </div>

          <svg
            className="helio-svg"
            viewBox="0 0 1180 520"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="helioSunCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffe08a" />
                <stop offset="45%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f97316" />
              </radialGradient>

              <radialGradient id="earthCorePremium" cx="45%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="55%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#1e3a8a" />
              </radialGradient>

              <radialGradient id="venusCore" cx="45%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#fcd34d" />
                <stop offset="100%" stopColor="#b45309" />
              </radialGradient>

              <radialGradient id="mercuryCore" cx="45%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#64748b" />
              </radialGradient>

              <radialGradient id="marsCore" cx="45%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#991b1b" />
              </radialGradient>

              <linearGradient id="auroraGreenPremium" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(34,197,94,0)" />
                <stop offset="50%" stopColor="rgba(34,197,94,0.95)" />
                <stop offset="100%" stopColor="rgba(34,197,94,0)" />
              </linearGradient>

              <linearGradient id="auroraPurplePremium" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(129,140,248,0)" />
                <stop offset="50%" stopColor="rgba(168,85,247,0.8)" />
                <stop offset="100%" stopColor="rgba(129,140,248,0)" />
              </linearGradient>

              <linearGradient id="windPremium" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(56,189,248,0.15)" />
                <stop offset="55%" stopColor="rgba(56,189,248,0.7)" />
                <stop offset="100%" stopColor="rgba(125,211,252,0.15)" />
              </linearGradient>

              <linearGradient id="windStorm" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(244,114,182,0.15)" />
                <stop offset="50%" stopColor="rgba(129,140,248,0.9)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0.18)" />
              </linearGradient>
            </defs>

            {/* Orbit guides */}
            <ellipse cx="250" cy="260" rx="86" ry="86" className="orbit-line orbit-1" />
            <ellipse cx="250" cy="260" rx="128" ry="128" className="orbit-line orbit-2" />
            <ellipse cx="250" cy="260" rx="178" ry="178" className="orbit-line orbit-3" />
            <ellipse cx="250" cy="260" rx="228" ry="228" className="orbit-line orbit-4" />

            {/* Sun */}
            <g className="sun-system">
              <circle cx="250" cy="260" r="64" className="sun-corona outer" />
              <circle cx="250" cy="260" r="88" className="sun-corona inner" />
              <circle cx="250" cy="260" r="54" fill="url(#helioSunCore)" className="sun-disk-premium" />

              <path
                d="M220 238 C236 228, 265 228, 282 238
                   M218 261 C238 250, 270 250, 286 261
                   M224 284 C246 272, 270 272, 280 284"
                className="sun-band"
              />

              {visual.flarePresent && (
                <>
                  <path
                    d="M294 225 C320 200, 345 205, 362 230"
                    className={`solar-flare flare-${visual.flareStrength}`}
                  />
                  <path
                    d="M292 298 C315 320, 336 320, 350 304"
                    className={`solar-flare flare-${visual.flareStrength}`}
                  />
                </>
              )}
            </g>

            {/* Inner planets */}
            <g className="mercury-orbit-anim">
              <circle cx="336" cy="260" r="7" fill="url(#mercuryCore)" className="planet mercury" />
            </g>

            <g className="venus-orbit-anim">
              <circle cx="378" cy="260" r="10" fill="url(#venusCore)" className="planet venus" />
            </g>

            <g className="earth-orbit-anim">
              <circle cx="428" cy="260" r="11" fill="url(#earthCorePremium)" className="planet earth-small" />
            </g>

            <g className="mars-orbit-anim">
              <circle cx="478" cy="260" r="8" fill="url(#marsCore)" className="planet mars" />
            </g>

            {/* Solar wind toward Earth */}
            <path d="M338 170 C470 165, 620 160, 770 165 C860 168, 930 182, 1000 220" className={`solar-wind-line ${visual.level}`} />
            <path d="M334 220 C470 220, 620 220, 760 220 C860 220, 930 226, 1000 246" className={`solar-wind-line ${visual.level}`} />
            <path d="M332 270 C470 275, 620 278, 760 280 C860 282, 930 290, 1000 300" className={`solar-wind-line ${visual.level}`} />
            <path d="M336 320 C470 328, 620 334, 765 340 C860 344, 930 340, 1000 324" className={`solar-wind-line ${visual.level}`} />

            {/* CME blob */}
            {visual.cme.hasCme && (
              <>
                <ellipse
                  cx="515"
                  cy="255"
                  rx={visual.level === "storm" ? "96" : "68"}
                  ry={visual.level === "storm" ? "56" : "38"}
                  className={`cme-wave-core ${visual.level}`}
                />
                <ellipse
                  cx="595"
                  cy="255"
                  rx={visual.level === "storm" ? "84" : "58"}
                  ry={visual.level === "storm" ? "48" : "32"}
                  className={`cme-wave-tail ${visual.level}`}
                />
              </>
            )}

            {/* Earth operational view */}
            <g className="earth-focus-group">
              <ellipse cx="910" cy="260" rx="18" ry="132" className="magnetotail" />

              <path
                d="M860 145
                   C940 116, 1008 152, 1030 214
                   C1038 235, 1042 249, 1042 260
                   C1042 272, 1038 286, 1030 307
                   C1008 368, 940 405, 860 375"
                className={`magnetosphere-shell ${visual.level}`}
              />

              <circle cx="865" cy="260" r="44" fill="url(#earthCorePremium)" className="earth-disk-premium" />

              <path
                d="M845 250 C855 245, 875 246, 886 255
                   M850 275 C864 286, 882 286, 892 274"
                className="earth-band"
              />

              <line x1="865" y1="216" x2="865" y2="304" className="earth-axis" />

              {(visual.level === "active" || visual.level === "storm") && (
                <>
                  <path
                    d="M818 212 C838 188, 892 186, 912 214"
                    stroke="url(#auroraGreenPremium)"
                    strokeWidth={visual.level === "storm" ? "12" : "8"}
                    fill="none"
                    strokeLinecap="round"
                    className="aurora-arc"
                  />
                  <path
                    d="M818 308 C838 334, 892 334, 912 306"
                    stroke="url(#auroraGreenPremium)"
                    strokeWidth={visual.level === "storm" ? "12" : "8"}
                    fill="none"
                    strokeLinecap="round"
                    className="aurora-arc"
                  />
                </>
              )}

              {visual.level === "storm" && (
                <>
                  <path
                    d="M812 202 C840 173, 892 173, 918 204"
                    stroke="url(#auroraPurplePremium)"
                    strokeWidth="9"
                    fill="none"
                    strokeLinecap="round"
                    className="aurora-arc"
                  />
                  <path
                    d="M812 318 C840 346, 892 346, 918 316"
                    stroke="url(#auroraPurplePremium)"
                    strokeWidth="9"
                    fill="none"
                    strokeLinecap="round"
                    className="aurora-arc"
                  />
                </>
              )}
            </g>
          </svg>

          <div className="helio-scene-copy">
            <h3>{visual.title}</h3>
            <p>{visual.subtitle}</p>
          </div>
        </div>

        <div className="helio-side">
          <div className="helio-side-card">
            <div className="helio-side-label">Live activity snapshot</div>

            <div className="helio-stat-grid">
              <div>
                <span>Kp</span>
                <strong>{kp}</strong>
              </div>

              <div>
                <span>Bz</span>
                <strong>{bz}</strong>
              </div>

              <div>
                <span>Wind</span>
                <strong>{wind}</strong>
              </div>

              <div>
                <span>Aurora</span>
                <strong>{visual.auroraText}</strong>
              </div>
            </div>
          </div>

          <div className="helio-side-card">
            <div className="helio-side-label">Solar activity</div>

            <div className="helio-activity-list">
              <div>
                <span>Solar flare</span>
                <strong>{flareBadge}</strong>
              </div>

              <div>
                <span>CME status</span>
                <strong>{visual.cme.label}</strong>
              </div>

              <div>
                <span>Magnetosphere</span>
                <strong>
                  {visual.level === "storm"
                    ? "Compressed / disturbed"
                    : visual.level === "active"
                      ? "Responsive"
                      : "Stable"}
                </strong>
              </div>

              <div>
                <span>Solar rotation</span>
                <strong>Visualized</strong>
              </div>
            </div>
          </div>

          <div className="helio-side-card">
            <div className="helio-side-label">What you are seeing</div>

            <ul className="helio-bullet-list">
              {bullets.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
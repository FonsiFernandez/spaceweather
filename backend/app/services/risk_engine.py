"""
Risk engine: translates raw space weather indices into operational risk levels
per asset type. This is the system's core differentiator.

Asset profiles model how different infrastructure segments respond to space weather.
Each asset has threshold mappings for Kp, Bz, solar wind speed, and NOAA scales.
"""
from dataclasses import dataclass, field
from typing import Literal
from app.core.store import store

RiskLevel = Literal["nominal", "elevated", "high", "severe", "extreme"]
RISK_SCORES = {"nominal": 0, "elevated": 1, "high": 2, "severe": 3, "extreme": 4}


@dataclass
class AssetRisk:
    asset_id: str
    asset_name: str
    risk_level: RiskLevel
    score: int
    drivers: list[str]
    mitigations: list[str]


@dataclass
class SystemRiskAssessment:
    overall_level: RiskLevel
    overall_score: int
    assets: list[AssetRisk]
    active_warnings: list[str]
    kp_now: float
    bz_now: float | None
    wind_speed_now: float | None
    g_scale: int
    s_scale: int
    r_scale: int


ASSET_PROFILES = {
    "leo_satellites": {
        "name": "LEO satellites",
        "description": "Low Earth Orbit spacecraft (drag, charging)",
        "thresholds": {
            "kp": [(5, "elevated"), (7, "high"), (8, "severe"), (9, "extreme")],
            "g_scale": [(1, "elevated"), (3, "high"), (4, "severe"), (5, "extreme")],
            "s_scale": [(1, "elevated"), (2, "high"), (3, "severe"), (4, "extreme")],
        },
        "drivers_map": {
            "elevated": ["Increased atmospheric drag", "Surface charging begins"],
            "high": ["Significant drag perturbation", "Deep charging risk"],
            "severe": ["Orbit decay acceleration", "SEU/latchup risk elevated"],
            "extreme": ["Emergency maneuver may be required", "Component failure risk"],
        },
        "mitigations": {
            "elevated": ["Monitor attitude control", "Check power subsystem"],
            "high": ["Safe-mode readiness check", "Reduce exposure of sensitive components"],
            "severe": ["Consider safe mode", "Ground station contact window priority"],
            "extreme": ["Safe mode recommended", "Contingency ops"],
        },
    },
    "gnss_gps": {
        "name": "GNSS / GPS",
        "description": "Navigation signal accuracy and availability",
        "thresholds": {
            "kp": [(4, "elevated"), (6, "high"), (7, "severe"), (8, "extreme")],
            "r_scale": [(1, "elevated"), (2, "high"), (3, "severe"), (4, "extreme")],
            "s_scale": [(2, "elevated"), (3, "high"), (4, "severe")],
        },
        "drivers_map": {
            "elevated": ["Ionospheric scintillation begins", "Positioning error +1-3m"],
            "high": ["Strong scintillation", "Positioning error +5-10m"],
            "severe": ["Signal outages possible", "Single-freq receivers unreliable"],
            "extreme": ["Navigation outages likely", "Aviation GNSS may be unavailable"],
        },
        "mitigations": {
            "elevated": ["Use dual-frequency if available", "Monitor RAIM"],
            "high": ["Activate backup navigation", "Increase RAIM thresholds"],
            "severe": ["Switch to inertial/dead reckoning", "Alert aviation users"],
            "extreme": ["Suspend GNSS-dependent operations", "Emergency protocols"],
        },
    },
    "hf_radio": {
        "name": "HF radio communications",
        "description": "Shortwave comms (aviation, maritime, amateur)",
        "thresholds": {
            "kp": [(4, "elevated"), (6, "high"), (7, "severe")],
            "r_scale": [(1, "elevated"), (2, "high"), (3, "severe"), (4, "extreme")],
        },
        "drivers_map": {
            "elevated": ["Polar route degradation", "Minor absorption"],
            "high": ["HF blackout on sunlit hemisphere", "Rerouting needed"],
            "severe": ["Wide-area HF blackout", "Polar routes unavailable"],
            "extreme": ["Complete HF blackout", "All polar aviation affected"],
        },
        "mitigations": {
            "elevated": ["Monitor frequencies", "Have UHF/VHF backup ready"],
            "high": ["Switch to satellite comms", "Avoid polar routes"],
            "severe": ["Mandatory satcomm", "Issue NOTAM/NOTMAR"],
            "extreme": ["All HF inoperative", "Emergency comms only"],
        },
    },
    "power_grid": {
        "name": "Power grid (mid/high lat.)",
        "description": "GIC effects on transformers and grid stability",
        "thresholds": {
            "kp": [(5, "elevated"), (7, "high"), (8, "severe"), (9, "extreme")],
            "g_scale": [(2, "elevated"), (3, "high"), (4, "severe"), (5, "extreme")],
        },
        "drivers_map": {
            "elevated": ["GIC monitoring recommended", "Transformer heating begins"],
            "high": ["Significant GIC on long lines", "Voltage fluctuations"],
            "severe": ["Possible grid instability", "Transformer damage risk"],
            "extreme": ["Widespread outage risk", "Major transformer damage possible"],
        },
        "mitigations": {
            "elevated": ["Activate GIC monitors", "Alert grid operators"],
            "high": ["Reduce reactive power", "Increase grid margins"],
            "severe": ["Pre-position reserves", "Consider load shedding"],
            "extreme": ["Emergency disconnection protocols", "Islanding procedures"],
        },
    },
}


async def compute_risk_assessment() -> SystemRiskAssessment:
    """
    Main risk computation. Reads current state from store and
    returns a full risk assessment for all asset types.
    """
    sw = await store.get_solar_wind()
    kp_data = await store.get_kp()
    scales = await store.get_scales()

    kp = float(kp_data.get("kp", 0) or 0)
    bz = sw.get("bz")
    speed = sw.get("speed")
    g = int(scales.get("G", 0) or 0)
    s = int(scales.get("S", 0) or 0)
    r = int(scales.get("R", 0) or 0)

    # Bz southward amplifies everything
    bz_penalty = 0
    if bz is not None and bz < -10:
        bz_penalty = 1
    elif bz is not None and bz < -20:
        bz_penalty = 2

    asset_risks = []
    for asset_id, profile in ASSET_PROFILES.items():
        score, level = _score_asset(
            asset_id, profile, kp + bz_penalty * 0.5, g, s, r
        )
        drivers = profile["drivers_map"].get(level, [])
        mitigations = profile["mitigations"].get(level, [])

        if bz is not None and bz < -10:
            drivers = [f"Southward Bz ({bz:.1f} nT) amplifying effect"] + drivers

        asset_risks.append(
            AssetRisk(
                asset_id=asset_id,
                asset_name=profile["name"],
                risk_level=level,
                score=score,
                drivers=drivers,
                mitigations=mitigations,
            )
        )

    overall_score = max((a.score for a in asset_risks), default=0)
    overall_level = _score_to_level(overall_score)

    warnings = _build_warnings(kp, bz, speed, g, s, r)

    return SystemRiskAssessment(
        overall_level=overall_level,
        overall_score=overall_score,
        assets=asset_risks,
        active_warnings=warnings,
        kp_now=kp,
        bz_now=bz,
        wind_speed_now=speed,
        g_scale=g,
        s_scale=s,
        r_scale=r,
    )


def _score_asset(asset_id, profile, kp, g, s, r) -> tuple[int, RiskLevel]:
    thresholds = profile["thresholds"]
    score = 0

    for idx_val, scale_key in [(kp, "kp"), (g, "g_scale"), (s, "s_scale"), (r, "r_scale")]:
        if scale_key not in thresholds:
            continue
        for threshold, level in reversed(thresholds[scale_key]):
            if idx_val >= threshold:
                score = max(score, RISK_SCORES[level])
                break

    return score, _score_to_level(score)


def _score_to_level(score: int) -> RiskLevel:
    return ["nominal", "elevated", "high", "severe", "extreme"][min(score, 4)]


def _build_warnings(kp, bz, speed, g, s, r) -> list[str]:
    w = []
    if bz is not None and bz < -20:
        w.append(f"Extreme southward Bz ({bz:.1f} nT) — severe geomagnetic coupling")
    elif bz is not None and bz < -10:
        w.append(f"Strong southward Bz ({bz:.1f} nT) — elevated geomagnetic activity")
    if speed and speed > 700:
        w.append(f"Very high solar wind speed ({speed:.0f} km/s)")
    if kp >= 8:
        w.append(f"Kp = {kp} — G{_kp_to_g(kp)} geomagnetic storm in progress")
    elif kp >= 5:
        w.append(f"Kp = {kp} — G{_kp_to_g(kp)} geomagnetic storm conditions")
    if r >= 3:
        w.append(f"R{r} radio blackout — HF communications severely impacted")
    if s >= 3:
        w.append(f"S{s} radiation storm — elevated SEP flux")
    return w


def _kp_to_g(kp: float) -> int:
    if kp >= 9:
        return 5
    elif kp >= 8:
        return 4
    elif kp >= 7:
        return 3
    elif kp >= 6:
        return 2
    elif kp >= 5:
        return 1
    return 0

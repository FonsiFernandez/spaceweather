from dataclasses import asdict

from fastapi import APIRouter

from app.core.store import store
from app.services.risk_engine import compute_risk_assessment

router = APIRouter(prefix="/briefing", tags=["Briefing"])


@router.get("")
async def get_briefing():
    """
    Executive operational summary.

    This endpoint summarizes current space weather conditions,
    asset risk and recommended operator actions.
    """
    assessment = await compute_risk_assessment()
    assessment_dict = asdict(assessment)

    assets = assessment.assets
    top_asset = max(assets, key=lambda item: item.score) if assets else None

    solar_wind = await store.get_solar_wind()
    kp = await store.get_kp()
    scales = await store.get_scales()
    alerts = await store.get_alerts()

    if top_asset:
        summary = (
            f"Current space weather conditions are classified as "
            f"{assessment.overall_level}. The most affected asset profile is "
            f"{top_asset.asset_name} with risk score {top_asset.score}."
        )
    else:
        summary = (
            f"Current space weather conditions are classified as "
            f"{assessment.overall_level}. No asset-specific risk is currently available."
        )

    return {
        "level": assessment.overall_level,
        "score": assessment.overall_score,
        "summary": summary,
        "solar_wind": solar_wind,
        "kp": kp,
        "noaa_scales": scales,
        "active_alerts_count": len(alerts),
        "top_risk_asset": asdict(top_asset) if top_asset else None,
        "risk_assessment": assessment_dict,
        "recommended_actions": _build_recommended_actions(
            assessment.overall_level,
            top_asset.asset_id if top_asset else None,
        ),
    }


def _build_recommended_actions(level: str, asset_id: str | None) -> list[str]:
    actions = [
        "Continue monitoring NOAA SWPC alerts.",
        "Review Kp, Bz and solar wind speed evolution.",
    ]

    if level in ["high", "severe", "extreme"]:
        actions.append("Escalate monitoring cadence for vulnerable operational assets.")
    elif level == "elevated":
        actions.append("Maintain increased awareness for space-weather-sensitive operations.")

    if asset_id == "leo_satellites":
        actions.append("Review LEO satellite drag-sensitive operations and contact windows.")
    elif asset_id == "gnss_gps":
        actions.append("Monitor GNSS accuracy degradation and ionospheric disturbance.")
    elif asset_id == "hf_radio":
        actions.append("Prepare backup communications for HF-dependent operations.")
    elif asset_id == "power_grid":
        actions.append("Monitor geomagnetic storm conditions relevant to GIC risk.")

    return actions
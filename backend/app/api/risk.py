from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from app.services.risk_engine import compute_risk_assessment

router = APIRouter(prefix="/risk-level", tags=["Risk"])


@router.get("")
async def get_risk_level():
    assessment = await compute_risk_assessment()
    return asdict(assessment)


@router.get("/{asset_id}")
async def get_risk_level_for_asset(asset_id: str):
    assessment = await compute_risk_assessment()

    for asset in assessment.assets:
        if asset.asset_id == asset_id:
            return asdict(asset)

    raise HTTPException(
        status_code=404,
        detail=f"Unknown asset profile: {asset_id}",
    )
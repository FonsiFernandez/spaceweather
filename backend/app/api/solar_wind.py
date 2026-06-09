from fastapi import APIRouter

from app.core.store import store

router = APIRouter(prefix="/solar-wind", tags=["Solar wind"])


@router.get("")
async def get_solar_wind():
    return await store.get_solar_wind()


@router.get("/history")
async def get_solar_wind_history():
    return {
        "period": "latest samples",
        "items": await store.get_solar_wind_history(),
    }


@router.get("/kp")
async def get_kp():
    return {
        "current": await store.get_kp(),
        "history": await store.get_kp_history(),
    }


@router.get("/scales")
async def get_scales():
    return await store.get_scales()


@router.get("/status")
async def get_status():
    return await store.get_status()

@router.get("/sources")
async def get_sources():
    return await store.get_source_status()
from fastapi import APIRouter

from app.core.store import store

router = APIRouter(prefix="/forecast", tags=["Forecast"])


@router.get("")
async def get_forecast():
    """
    Returns approximate CME arrival estimates.

    For now this endpoint depends on events already stored in memory.
    When DONKI ingestion is connected, CME events will populate this forecast.
    """
    events = await store.get_events()

    cmes = [
        event for event in events
        if event.get("type") == "CME"
    ]

    return {
        "summary": "Approximate CME arrival estimates based on available event metadata.",
        "count": len(cmes),
        "items": [
            {
                "id": cme.get("id"),
                "title": cme.get("title"),
                "start_time": cme.get("start_time") or cme.get("time"),
                "estimated_arrival": cme.get("estimated_arrival"),
                "confidence": cme.get("confidence", "low"),
                "source": cme.get("source", "NASA DONKI"),
            }
            for cme in cmes
        ],
    }
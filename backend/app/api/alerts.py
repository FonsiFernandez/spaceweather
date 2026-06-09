from fastapi import APIRouter, Query

from app.core.store import store

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("")
async def get_alerts(severity: str | None = Query(default=None)):
    alerts = await store.get_alerts()

    if severity:
        return [
            alert for alert in alerts
            if severity.lower() in str(alert).lower()
        ]

    return alerts


@router.get("/history")
async def get_alert_history():
    alerts = await store.get_alerts()

    return {
        "count": len(alerts),
        "items": alerts,
    }
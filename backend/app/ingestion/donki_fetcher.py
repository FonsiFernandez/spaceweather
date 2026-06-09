import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

BASE = settings.NASA_DONKI_BASE


def _date_range(days_back: int = 7) -> tuple[str, str]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days_back)
    return start.isoformat(), end.isoformat()


async def fetch_flares(days_back: int = 7) -> list[dict[str, Any]]:
    start, end = _date_range(days_back)

    url = f"{BASE}/FLR"
    params = {
        "startDate": start,
        "endDate": end,
        "api_key": settings.NASA_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        return [_normalize_flare(item) for item in data]

    except Exception as exc:
        logger.warning(f"fetch_flares error: {exc}")
        return []


async def fetch_cmes(days_back: int = 7) -> list[dict[str, Any]]:
    start, end = _date_range(days_back)

    url = f"{BASE}/CMEAnalysis"
    params = {
        "startDate": start,
        "endDate": end,
        "mostAccurateOnly": "true",
        "speed": 0,
        "halfAngle": 0,
        "catalog": "ALL",
        "api_key": settings.NASA_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        return [_normalize_cme(item) for item in data]

    except Exception as exc:
        logger.warning(f"fetch_cmes error: {exc}")
        return []


async def fetch_geomagnetic_storms(days_back: int = 14) -> list[dict[str, Any]]:
    start, end = _date_range(days_back)

    url = f"{BASE}/GST"
    params = {
        "startDate": start,
        "endDate": end,
        "api_key": settings.NASA_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        return [_normalize_storm(item) for item in data]

    except Exception as exc:
        logger.warning(f"fetch_geomagnetic_storms error: {exc}")
        return []


def _normalize_flare(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("flrID"),
        "type": "FLR",
        "source": "NASA DONKI",
        "title": f"Solar flare {item.get('classType', '')}".strip(),
        "class": item.get("classType"),
        "time": item.get("beginTime"),
        "peak_time": item.get("peakTime"),
        "end_time": item.get("endTime"),
        "active_region": item.get("activeRegionNum"),
        "linked_events": item.get("linkedEvents") or [],
        "raw": item,
    }


def _normalize_cme(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("associatedCMEID") or item.get("activityID") or item.get("time21_5"),
        "type": "CME",
        "source": "NASA DONKI",
        "title": "Coronal Mass Ejection",
        "time": item.get("time21_5"),
        "speed": _safe_float(item.get("speed")),
        "latitude": item.get("latitude"),
        "longitude": item.get("longitude"),
        "half_angle": item.get("halfAngle"),
        "is_earth_directed": _is_probably_earth_directed(item),
        "estimated_arrival": _estimate_arrival(item),
        "linked_events": item.get("linkedEvents") or [],
        "raw": item,
    }


def _normalize_storm(item: dict[str, Any]) -> dict[str, Any]:
    kp_index = _extract_max_kp(item)

    return {
        "id": item.get("gstID"),
        "type": "GST",
        "source": "NASA DONKI",
        "title": f"Geomagnetic storm Kp {kp_index}" if kp_index else "Geomagnetic storm",
        "time": item.get("startTime"),
        "kp_index": kp_index,
        "g_scale": _kp_to_g(kp_index),
        "linked_events": item.get("linkedEvents") or [],
        "raw": item,
    }


def _extract_max_kp(item: dict[str, Any]) -> float | None:
    values = []

    for entry in item.get("allKpIndex") or []:
        kp = _safe_float(entry.get("kpIndex"))
        if kp is not None:
            values.append(kp)

    return max(values) if values else None


def _kp_to_g(kp: float | None) -> int:
    if kp is None:
        return 0
    if kp >= 9:
        return 5
    if kp >= 8:
        return 4
    if kp >= 7:
        return 3
    if kp >= 6:
        return 2
    if kp >= 5:
        return 1
    return 0


def _is_probably_earth_directed(item: dict[str, Any]) -> bool:
    longitude = _safe_float(item.get("longitude"))
    half_angle = _safe_float(item.get("halfAngle"))

    if longitude is not None and abs(longitude) <= 45:
        return True

    if half_angle is not None and half_angle >= 90:
        return True

    return False


def _estimate_arrival(item: dict[str, Any]) -> str | None:
    time_21_5 = item.get("time21_5")
    speed = _safe_float(item.get("speed"))

    if not time_21_5 or not speed:
        return None

    try:
        start = datetime.fromisoformat(time_21_5.replace("Z", "+00:00"))

        if speed >= 1500:
            hours = 24
        elif speed >= 1000:
            hours = 36
        elif speed >= 700:
            hours = 48
        else:
            hours = 72

        return (start + timedelta(hours=hours)).isoformat()

    except Exception:
        return None


def _safe_float(value) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
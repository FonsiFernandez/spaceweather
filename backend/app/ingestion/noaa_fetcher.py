"""
Fetches real-time data from NOAA SWPC public JSON endpoints.
All endpoints are free, no auth required.
"""
import httpx
import logging
from datetime import datetime, timezone
from app.core.config import settings

logger = logging.getLogger(__name__)
BASE = settings.NOAA_BASE


async def fetch_solar_wind() -> dict | None:
    """
    DSCOVR/ACE real-time solar wind.
    Returns latest Bz, Bt, speed, density, temperature.
    """
    url = f"{BASE}/products/solar-wind/mag-7-day.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            # Format: [[time_tag, bx, by, bz, lon, lat, bt], ...]
            if not data or len(data) < 2:
                return None
            latest = data[-1]
            return {
                "time_tag": latest[0],
                "bx": _safe_float(latest[1]),
                "by": _safe_float(latest[2]),
                "bz": _safe_float(latest[3]),
                "bt": _safe_float(latest[6]),
                "source": "DSCOVR/ACE",
            }
    except Exception as e:
        logger.warning(f"fetch_solar_wind error: {e}")
        return None


async def fetch_solar_wind_plasma() -> dict | None:
    """Speed, density, temperature from DSCOVR."""
    url = f"{BASE}/products/solar-wind/plasma-7-day.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            if not data or len(data) < 2:
                return None
            latest = data[-1]
            return {
                "time_tag": latest[0],
                "speed": _safe_float(latest[1]),
                "density": _safe_float(latest[2]),
                "temperature": _safe_float(latest[3]),
            }
    except Exception as e:
        logger.warning(f"fetch_solar_wind_plasma error: {e}")
        return None


async def fetch_kp_index() -> list[dict] | None:
    """
    Planetary K-index, 3-hour intervals.

    NOAA usually returns a list-of-lists:
    [
      ["time_tag", "kp", "a_running", "station_count"],
      ["2026-06-09 00:00:00.000", "1.67", "...", "..."],
      ...
    ]

    This parser is defensive because NOAA product formats may contain
    different numbers of columns.
    """
    url = f"{BASE}/products/noaa-planetary-k-index.json"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()

            if not data or len(data) < 2:
                logger.warning("Kp endpoint returned no usable rows")
                return []

            result = []

            # Case 1: NOAA list-of-lists with header row
            if isinstance(data, list) and isinstance(data[0], list):
                header = data[0]
                rows = data[1:]

                logger.info(f"Kp header: {header}")
                logger.info(f"Kp rows received: {len(rows)}")

                for row in rows:
                    if not row or len(row) < 2:
                        continue

                    time_tag = row[0]
                    kp = _safe_float(row[1])

                    if kp is None:
                        continue

                    result.append({
                        "time_tag": _normalize_noaa_time(time_tag),
                        "kp": kp,
                        "status": "observed",
                    })

                return result

            # Case 2: list of dicts, just in case format changes
            if isinstance(data, list) and isinstance(data[0], dict):
                for row in data:
                    kp = _safe_float(
                        row.get("kp")
                        or row.get("kp_index")
                        or row.get("Kp")
                    )

                    if kp is None:
                        continue

                    result.append({
                        "time_tag": _normalize_noaa_time(
                            row.get("time_tag")
                            or row.get("time")
                            or row.get("date")
                        ),
                        "kp": kp,
                        "status": row.get("status", "observed"),
                    })

                return result

            logger.warning(f"Unexpected Kp response format: {type(data)}")
            return []

    except Exception as e:
        logger.warning(f"fetch_kp_index error: {e}")
        return None


async def fetch_geomagnetic_scales() -> dict | None:
    """
    Current G (geomagnetic), S (radiation), R (radio blackout) scales.
    """
    url = f"{BASE}/products/noaa-scales.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            # Returns nested dict: {"0": {"G": {...}, "S": {...}, "R": {...}}, "-1": ..., "-2": ...}
            today = data.get("0", {})
            return {
                "G": int(today.get("G", {}).get("Scale", 0) or 0),
                "S": int(today.get("S", {}).get("Scale", 0) or 0),
                "R": int(today.get("R", {}).get("Scale", 0) or 0),
                "G_text": today.get("G", {}).get("Text", ""),
                "S_text": today.get("S", {}).get("Text", ""),
                "R_text": today.get("R", {}).get("Text", ""),
            }
    except Exception as e:
        logger.warning(f"fetch_geomagnetic_scales error: {e}")
        return None


async def fetch_alerts() -> list | None:
    """Current active SWPC alerts, watches, and warnings."""
    url = f"{BASE}/products/alerts.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            return data
    except Exception as e:
        logger.warning(f"fetch_alerts error: {e}")
        return None


async def fetch_xray_flux() -> list | None:
    """GOES X-ray flux (1-min), last 7 days. Used for flare detection."""
    url = f"{BASE}/json/goes/primary/xrays-7-day.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            # Take last 60 readings (1 hour)
            return data[-60:] if len(data) >= 60 else data
    except Exception as e:
        logger.warning(f"fetch_xray_flux error: {e}")
        return None


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return None if v == -9999.9 else v
    except (TypeError, ValueError):
        return None

def _normalize_noaa_time(value) -> str | None:
    if value is None:
        return None

    text = str(value)

    # NOAA sometimes returns: "2026-06-09 00:00:00.000"
    # Frontend expects something sliceable with date/time.
    if " " in text and "T" not in text:
        text = text.replace(" ", "T")

    if text.endswith("Z"):
        return text

    return f"{text}Z"
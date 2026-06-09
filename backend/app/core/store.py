import asyncio
from datetime import datetime, timezone
from typing import Any


class SpaceWeatherStore:
    def __init__(self):
        self._lock = asyncio.Lock()

        self.current_solar_wind: dict[str, Any] = {
            "time_tag": None,
            "bx": None,
            "by": None,
            "bz": None,
            "bt": None,
            "speed": None,
            "density": None,
            "temperature": None,
            "source": "NOAA SWPC",
            "updated_at": None,
        }

        self.solar_wind_history: list[dict[str, Any]] = []

        self.current_kp: dict[str, Any] = {
            "time_tag": None,
            "kp": 0,
            "status": "unknown",
            "updated_at": None,
        }

        self.kp_history: list[dict[str, Any]] = []

        self.current_scales: dict[str, Any] = {
            "G": 0,
            "S": 0,
            "R": 0,
            "G_text": "",
            "S_text": "",
            "R_text": "",
            "updated_at": None,
        }

        self.alerts: list[dict[str, Any]] = []

        self.xray_flux: list[dict[str, Any]] = []

        self.last_ingestion: dict[str, Any] = {
            "solar_wind": None,
            "kp": None,
            "scales": None,
            "alerts": None,
            "xray": None,
            "donki": None,
        }

        self.events: list[dict[str, Any]] = []

        self.source_status: dict[str, Any] = {
            "noaa_solar_wind_mag": {
                "name": "NOAA SWPC Solar Wind MAG",
                "url": "https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "noaa_solar_wind_plasma": {
                "name": "NOAA SWPC Solar Wind Plasma",
                "url": "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "noaa_kp": {
                "name": "NOAA SWPC Planetary K-index",
                "url": "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "noaa_scales": {
                "name": "NOAA SWPC G/S/R Scales",
                "url": "https://services.swpc.noaa.gov/products/noaa-scales.json",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "noaa_alerts": {
                "name": "NOAA SWPC Alerts",
                "url": "https://services.swpc.noaa.gov/products/alerts.json",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "noaa_xray": {
                "name": "NOAA GOES X-ray Flux",
                "url": "https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "nasa_donki_flares": {
                "name": "NASA DONKI Solar Flares",
                "url": "https://api.nasa.gov/DONKI/FLR",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "nasa_donki_cmes": {
                "name": "NASA DONKI CME Analysis",
                "url": "https://api.nasa.gov/DONKI/CMEAnalysis",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
            "nasa_donki_storms": {
                "name": "NASA DONKI Geomagnetic Storms",
                "url": "https://api.nasa.gov/DONKI/GST",
                "status": "unknown",
                "last_success": None,
                "last_error": None,
            },
        }

    async def update_solar_wind(
        self,
        mag: dict[str, Any] | None,
        plasma: dict[str, Any] | None,
    ) -> None:
        async with self._lock:
            if mag:
                self.current_solar_wind.update({
                    "time_tag": mag.get("time_tag"),
                    "bx": mag.get("bx"),
                    "by": mag.get("by"),
                    "bz": mag.get("bz"),
                    "bt": mag.get("bt"),
                    "source": mag.get("source", "DSCOVR/ACE"),
                })

            if plasma:
                self.current_solar_wind.update({
                    "speed": plasma.get("speed"),
                    "density": plasma.get("density"),
                    "temperature": plasma.get("temperature"),
                })

            self.current_solar_wind["updated_at"] = _utc_now()
            self.last_ingestion["solar_wind"] = _utc_now()

            snapshot = dict(self.current_solar_wind)
            self.solar_wind_history.append(snapshot)
            self.solar_wind_history = self.solar_wind_history[-500:]

    async def update_kp(self, kp_items: list[dict[str, Any]] | None) -> None:
        if not kp_items:
            return

        async with self._lock:
            latest = kp_items[-1]

            self.current_kp = {
                "time_tag": latest.get("time_tag"),
                "kp": latest.get("kp") or 0,
                "status": latest.get("status", "observed"),
                "updated_at": _utc_now(),
            }

            self.kp_history = kp_items[-100:]
            self.last_ingestion["kp"] = _utc_now()

    async def update_scales(self, scales: dict[str, Any] | None) -> None:
        if not scales:
            return

        async with self._lock:
            self.current_scales = {
                **scales,
                "updated_at": _utc_now(),
            }
            self.last_ingestion["scales"] = _utc_now()

    async def update_alerts(self, alerts: list[dict[str, Any]] | None) -> None:
        if alerts is None:
            return

        async with self._lock:
            self.alerts = alerts
            self.last_ingestion["alerts"] = _utc_now()

    async def update_xray_flux(self, items: list[dict[str, Any]] | None) -> None:
        if items is None:
            return

        async with self._lock:
            self.xray_flux = items
            self.last_ingestion["xray"] = _utc_now()

    async def get_solar_wind(self) -> dict[str, Any]:
        async with self._lock:
            return dict(self.current_solar_wind)

    async def get_solar_wind_history(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self.solar_wind_history)

    async def get_kp(self) -> dict[str, Any]:
        async with self._lock:
            return dict(self.current_kp)

    async def get_kp_history(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self.kp_history)

    async def get_scales(self) -> dict[str, Any]:
        async with self._lock:
            return dict(self.current_scales)

    async def get_alerts(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self.alerts)

    async def get_xray_flux(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self.xray_flux)

    async def get_status(self) -> dict[str, Any]:
        async with self._lock:
            return {
                "current_solar_wind": dict(self.current_solar_wind),
                "current_kp": dict(self.current_kp),
                "current_scales": dict(self.current_scales),
                "alerts_count": len(self.alerts),
                "xray_points": len(self.xray_flux),
                "last_ingestion": dict(self.last_ingestion),
            }

    async def get_events(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self.events)

    async def mark_source_success(self, source_id: str) -> None:
        async with self._lock:
            if source_id not in self.source_status:
                return

            self.source_status[source_id]["status"] = "ok"
            self.source_status[source_id]["last_success"] = _utc_now()
            self.source_status[source_id]["last_error"] = None

    async def mark_source_error(self, source_id: str, error: str) -> None:
        async with self._lock:
            if source_id not in self.source_status:
                return

            self.source_status[source_id]["status"] = "error"
            self.source_status[source_id]["last_error"] = error

    async def get_source_status(self) -> dict[str, Any]:
        async with self._lock:
            return {
                "overall": _overall_source_status(self.source_status),
                "sources": dict(self.source_status),
            }

    async def update_donki_events(
            self,
            flares: list[dict[str, Any]],
            cmes: list[dict[str, Any]],
            storms: list[dict[str, Any]],
    ) -> None:
        async with self._lock:
            self.events = [
                *flares,
                *cmes,
                *storms,
            ]

            self.last_ingestion["donki"] = _utc_now()

    async def get_events(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self.events)

    async def get_donki_split(self) -> dict[str, list[dict[str, Any]]]:
        async with self._lock:
            return {
                "flares": [event for event in self.events if event.get("type") == "FLR"],
                "cmes": [event for event in self.events if event.get("type") == "CME"],
                "storms": [event for event in self.events if event.get("type") == "GST"],
            }

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _overall_source_status(sources: dict[str, Any]) -> str:
    statuses = [source.get("status") for source in sources.values()]

    if any(status == "error" for status in statuses):
        return "degraded"

    if statuses and all(status == "ok" for status in statuses):
        return "ok"

    return "initializing"


store = SpaceWeatherStore()
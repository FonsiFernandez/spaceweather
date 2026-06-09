import asyncio
import logging

from app.core.store import store
from app.ingestion.noaa_fetcher import (
    fetch_alerts,
    fetch_geomagnetic_scales,
    fetch_kp_index,
    fetch_solar_wind,
    fetch_solar_wind_plasma,
    fetch_xray_flux,
)
from app.ingestion.donki_fetcher import (
    fetch_cmes,
    fetch_flares,
    fetch_geomagnetic_storms,
)

logger = logging.getLogger(__name__)


class IngestionScheduler:
    def __init__(self):
        self.tasks: list[asyncio.Task] = []
        self.running = False

    async def start(self) -> None:
        if self.running:
            return

        self.running = True

        self.tasks = [
            asyncio.create_task(self._solar_wind_loop()),
            asyncio.create_task(self._kp_loop()),
            asyncio.create_task(self._scales_loop()),
            asyncio.create_task(self._alerts_loop()),
            asyncio.create_task(self._xray_loop()),
            asyncio.create_task(self._donki_loop()),
        ]

        logger.info("Ingestion scheduler started")

    async def stop(self) -> None:
        self.running = False

        for task in self.tasks:
            task.cancel()

        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()

        logger.info("Ingestion scheduler stopped")

    async def _solar_wind_loop(self) -> None:
        while self.running:
            try:
                mag, plasma = await asyncio.gather(
                    fetch_solar_wind(),
                    fetch_solar_wind_plasma(),
                )

                await store.update_solar_wind(mag, plasma)

                if mag:
                    await store.mark_source_success("noaa_solar_wind_mag")
                else:
                    await store.mark_source_error("noaa_solar_wind_mag", "No MAG data returned")

                if plasma:
                    await store.mark_source_success("noaa_solar_wind_plasma")
                else:
                    await store.mark_source_error("noaa_solar_wind_plasma", "No plasma data returned")

                logger.info("Solar wind updated")

            except Exception as exc:
                await store.mark_source_error("noaa_solar_wind_mag", str(exc))
                await store.mark_source_error("noaa_solar_wind_plasma", str(exc))
                logger.exception("Solar wind ingestion failed")

            await asyncio.sleep(60)

    async def _kp_loop(self) -> None:
        while self.running:
            try:
                kp_items = await fetch_kp_index()
                await store.update_kp(kp_items)

                if kp_items:
                    await store.mark_source_success("noaa_kp")
                else:
                    await store.mark_source_error("noaa_kp", "No Kp data returned")

                logger.info("Kp index updated")

            except Exception as exc:
                await store.mark_source_error("noaa_kp", str(exc))
                logger.exception("Kp ingestion failed")

            await asyncio.sleep(180)

    async def _scales_loop(self) -> None:
        while self.running:
            try:
                scales = await fetch_geomagnetic_scales()
                await store.update_scales(scales)

                if scales:
                    await store.mark_source_success("noaa_scales")
                else:
                    await store.mark_source_error("noaa_scales", "No scale data returned")

                logger.info("NOAA scales updated")

            except Exception as exc:
                await store.mark_source_error("noaa_scales", str(exc))
                logger.exception("NOAA scales ingestion failed")

            await asyncio.sleep(180)

    async def _alerts_loop(self) -> None:
        while self.running:
            try:
                alerts = await fetch_alerts()
                await store.update_alerts(alerts)

                if alerts is not None:
                    await store.mark_source_success("noaa_alerts")
                else:
                    await store.mark_source_error("noaa_alerts", "No alerts data returned")

                logger.info("Alerts updated")

            except Exception as exc:
                await store.mark_source_error("noaa_alerts", str(exc))
                logger.exception("Alerts ingestion failed")

            await asyncio.sleep(120)

    async def _xray_loop(self) -> None:
        while self.running:
            try:
                xray = await fetch_xray_flux()
                await store.update_xray_flux(xray)

                if xray is not None:
                    await store.mark_source_success("noaa_xray")
                else:
                    await store.mark_source_error("noaa_xray", "No X-ray data returned")

                logger.info("X-ray flux updated")

            except Exception as exc:
                await store.mark_source_error("noaa_xray", str(exc))
                logger.exception("X-ray ingestion failed")

            await asyncio.sleep(300)

    async def _donki_loop(self) -> None:
            while self.running:
                try:
                    flares, cmes, storms = await asyncio.gather(
                        fetch_flares(days_back=7),
                        fetch_cmes(days_back=7),
                        fetch_geomagnetic_storms(days_back=14),
                    )

                    await store.update_donki_events(flares, cmes, storms)

                    await store.mark_source_success("nasa_donki_flares")
                    await store.mark_source_success("nasa_donki_cmes")
                    await store.mark_source_success("nasa_donki_storms")

                    logger.info(
                        "DONKI updated: %s flares, %s CMEs, %s storms",
                        len(flares),
                        len(cmes),
                        len(storms),
                    )

                except Exception as exc:
                    await store.mark_source_error("nasa_donki_flares", str(exc))
                    await store.mark_source_error("nasa_donki_cmes", str(exc))
                    await store.mark_source_error("nasa_donki_storms", str(exc))
                    logger.exception("DONKI ingestion failed")

                await asyncio.sleep(300)


scheduler = IngestionScheduler()
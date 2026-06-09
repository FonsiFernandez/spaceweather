from fastapi import APIRouter, Query

from app.core.store import store
from app.services.correlator import build_causal_chains

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("")
async def get_events(event_type: str | None = Query(default=None)):
    """
    Return current known space weather events.

    At this stage, this endpoint can return an empty list until DONKI ingestion
    is connected.
    """
    events = await store.get_events()

    if event_type:
        return [
            event for event in events
            if event.get("type", "").lower() == event_type.lower()
        ]

    return events


@router.get("/chains")
async def get_event_chains():
    """
    Return correlated causal chains.

    For now this depends on what exists in the in-memory event store.
    """
    events = await store.get_events()

    # Temporary compatibility mode:
    # If your correlator expects flares, cmes and storms separately,
    # split the generic event list here.
    flares = [event for event in events if event.get("type") == "FLR"]
    cmes = [event for event in events if event.get("type") == "CME"]
    storms = [event for event in events if event.get("type") == "GST"]

    return build_causal_chains(flares, cmes, storms)
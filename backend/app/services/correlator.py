"""
Event correlator: exploits DONKI's linkedEvents to build
causal chains of the form:
  Solar flare → CME launch → Interplanetary shock → Geomagnetic storm

This is the key insight that separates this system from simple monitors.
Operators can see "this storm was caused by the X3.2 flare on AR3664
that erupted 62 hours ago" — not just "Kp=7 right now".
"""
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


def build_causal_chains(
    flares: list, cmes: list, storms: list
) -> list[dict]:
    """
    Correlate events using DONKI's linkedEvents field.
    Returns chains sorted by most recent trigger.
    """
    # Index by activity ID for fast lookup
    flare_idx = {f["id"]: f for f in flares if f.get("id")}
    cme_idx = {c["id"]: c for c in cmes if c.get("id")}
    storm_idx = {s["id"]: s for s in storms if s.get("id")}

    chains = []
    visited_storms = set()

    # Walk backwards from storms → find their CMEs → find their flares
    for storm in storms:
        if storm["id"] in visited_storms:
            continue
        visited_storms.add(storm["id"])

        chain = {
            "chain_id": storm["id"],
            "trigger_flare": None,
            "cme": None,
            "storm": storm,
            "total_transit_hours": None,
            "status": _storm_status(storm),
        }

        # Find linked CME
        for link in storm.get("linked_events", []):
            lid = link.get("activityID", "")
            if "CME" in lid and lid in cme_idx:
                chain["cme"] = cme_idx[lid]
                break
            # Also search by partial match
            for cme_id, cme in cme_idx.items():
                if lid and lid[:10] in cme_id:
                    chain["cme"] = cme
                    break

        # If we found a CME, find its source flare
        if chain["cme"]:
            for link in chain["cme"].get("linked_events", []):
                lid = link.get("activityID", "")
                if "FLR" in lid and lid in flare_idx:
                    chain["trigger_flare"] = flare_idx[lid]
                    break

        # Compute transit time
        chain["total_transit_hours"] = _compute_transit(chain)

        if chain["cme"] or chain["trigger_flare"]:
            chains.append(chain)

    # Also add standalone recent chains (flares with linked CMEs but no storm yet)
    for flare in flares:
        has_cme = any("CME" in (l.get("activityID", "")) for l in flare.get("linked_events", []))
        if not has_cme:
            continue

        # Find the CME
        for link in flare.get("linked_events", []):
            lid = link.get("activityID", "")
            if "CME" in lid and lid in cme_idx:
                cme = cme_idx[lid]
                # Check if this CME is already in a chain
                in_chain = any(c.get("cme", {}) and c["cme"].get("id") == lid for c in chains)
                if not in_chain and cme.get("is_earth_directed"):
                    chains.append({
                        "chain_id": flare["id"],
                        "trigger_flare": flare,
                        "cme": cme,
                        "storm": None,
                        "total_transit_hours": None,
                        "status": "in_transit",
                    })

    chains.sort(key=lambda c: _chain_time(c), reverse=True)
    return chains[:20]


def _storm_status(storm: dict) -> str:
    try:
        t = datetime.fromisoformat(storm["time"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        age_h = (now - t).total_seconds() / 3600
        if age_h < 24:
            return "active"
        elif age_h < 72:
            return "recovery"
        return "historical"
    except Exception:
        return "unknown"


def _compute_transit(chain: dict) -> float | None:
    try:
        trigger = chain.get("trigger_flare") or chain.get("cme")
        storm = chain.get("storm")
        if not trigger or not storm:
            return None
        t1 = datetime.fromisoformat(trigger["time"].replace("Z", "+00:00"))
        t2 = datetime.fromisoformat(storm["time"].replace("Z", "+00:00"))
        return round((t2 - t1).total_seconds() / 3600, 1)
    except Exception:
        return None


def _chain_time(c: dict) -> str:
    for key in ["storm", "cme", "trigger_flare"]:
        ev = c.get(key)
        if ev and ev.get("time"):
            return ev["time"]
    return ""

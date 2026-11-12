"""Truck types and their sizes, turned into Valhalla's truck costing options.

Valhalla avoids roads whose OpenStreetMap limits the truck breaks: maxheight
(low bridges), maxwidth, maxlength, maxweight, maxaxleload, hazmat and
"no trucks" tags. Example: under the 12'4" Gregson Street bridge in Durham, NC,
a 12'0" box truck drives straight through, a 13'6" dry van is sent around it.

Presets are typical US numbers; every value can be changed by the user.
Routing uses the GROSS weight (empty truck + load); the brief's weather rules
use the LOAD weight, so both are kept.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

FT_TO_M = 0.3048
LB_PER_METRIC_TON = 2204.62
FEDERAL_GROSS_LIMIT_LB = 80_000


@dataclass(frozen=True)
class TruckSpec:
    type: str
    label: str
    height_ft: float
    width_ft: float
    length_ft: float
    empty_lb: float  # tractor + trailer (or straight truck) without load
    axle_count: int
    hazmat: bool = False

    def gross_lb(self, load_lb: float) -> float:
        return self.empty_lb + load_lb

    def costing_options(self, load_lb: float) -> dict:
        """Valhalla `costing_options.truck` (metres and metric tons)."""
        gross_t = self.gross_lb(load_lb) / LB_PER_METRIC_TON
        return {
            "height": round(self.height_ft * FT_TO_M, 2),
            "width": round(self.width_ft * FT_TO_M, 2),
            "length": round(self.length_ft * FT_TO_M, 2),
            "weight": round(gross_t, 2),
            "axle_load": round(gross_t / max(self.axle_count, 1), 2),
            "axle_count": self.axle_count,
            "hazmat": self.hazmat,
        }

    def as_json(self, load_lb: float) -> dict:
        gross = self.gross_lb(load_lb)
        return asdict(self) | {"gross_lb": round(gross), "over_federal_limit": gross > FEDERAL_GROSS_LIMIT_LB}


PRESETS: dict[str, TruckSpec] = {
    "dry_van": TruckSpec("dry_van", "Dry van (53 ft)", 13.5, 8.5, 72, 35_000, 5),
    "reefer": TruckSpec("reefer", "Reefer (53 ft)", 13.5, 8.5, 72, 38_000, 5),
    "flatbed": TruckSpec("flatbed", "Flatbed (48 ft)", 11.0, 8.5, 67, 32_000, 5),
    "box_truck": TruckSpec("box_truck", "Box truck (26 ft)", 12.0, 8.0, 35, 14_000, 2),
    "tanker": TruckSpec("tanker", "Tanker, hazmat", 11.5, 8.5, 70, 30_000, 5, hazmat=True),
}

DEFAULT_TYPE = "dry_van"


def spec_from_request(data: dict | None) -> TruckSpec:
    """A preset, with any sizes the user changed laid on top."""
    data = data or {}
    base = PRESETS[data.get("type") or DEFAULT_TYPE]
    fields = ("height_ft", "width_ft", "length_ft", "empty_lb", "axle_count", "hazmat")
    changes = {k: data[k] for k in fields if data.get(k) is not None}
    return TruckSpec(**(asdict(base) | changes))

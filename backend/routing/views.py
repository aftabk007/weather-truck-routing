from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .serializers import HeatmapRequestSerializer, PlanRequestSerializer
from .services import geocode
from .services.heatmap import corridor_heatmap
from .services.http import UpstreamError
from .services.planner import plan_trip


def _upstream_failed(exc: UpstreamError) -> Response:
    return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"ok": True})


@api_view(["GET"])
def geocode_view(request: Request) -> Response:
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 3:
        return Response({"results": []})
    try:
        return Response({"results": geocode.search(q[:120])})
    except UpstreamError as exc:
        return _upstream_failed(exc)


@api_view(["POST"])
def plan_view(request: Request) -> Response:
    s = PlanRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    try:
        result = plan_trip(
            origin=(d["origin"]["lat"], d["origin"]["lon"]),
            destination=(d["destination"]["lat"], d["destination"]["lon"]),
            departure=d["departure"],
            load_lb=d["load_lb"],
            interval_mi=d["interval_mi"],
            rest_stops=d["rest_stops"],
        )
    except UpstreamError as exc:
        return _upstream_failed(exc)
    return Response(result)


@api_view(["POST"])
def heatmap_view(request: Request) -> Response:
    s = HeatmapRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    try:
        result = corridor_heatmap([(p[0], p[1]) for p in d["corridor"]], d["load_lb"])
    except UpstreamError as exc:
        return _upstream_failed(exc)
    return Response(result)

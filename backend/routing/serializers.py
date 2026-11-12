from datetime import datetime, timedelta, timezone

from rest_framework import serializers

MAX_DAYS_AHEAD = 5  # forecasts reach 8 days; long trips with rest stops need the margin


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(required=False, allow_blank=True, max_length=200)


class PlanRequestSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=0, max_value=200_000)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)
    rest_stops = serializers.BooleanField(default=True)

    def validate_departure(self, value: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        if value < now - timedelta(hours=1):
            raise serializers.ValidationError("Departure is in the past.")
        if value > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(f"Departure must be within {MAX_DAYS_AHEAD} days (forecast range).")
        return value

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        if abs(o["lat"] - d["lat"]) < 1e-4 and abs(o["lon"] - d["lon"]) < 1e-4:
            raise serializers.ValidationError("Origin and destination are the same place.")
        return attrs


class HeatmapRequestSerializer(serializers.Serializer):
    corridor = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        min_length=2,
        max_length=3000,
    )
    load_lb = serializers.FloatField(min_value=0, max_value=200_000)

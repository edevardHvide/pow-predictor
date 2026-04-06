import json
import math
import urllib.request
import re
from datetime import datetime, timezone


# MEPS Lambert Conformal Conic projection parameters
LAT0 = 63.3   # latitude_of_projection_origin
LON0 = 15.0   # longitude_of_central_meridian
LAT1 = 63.3   # standard_parallel
R = 6371000.0  # earth_radius
GRID_X0 = -1060084.0  # first x coordinate
GRID_Y0 = -1332517.9  # first y coordinate
GRID_DX = 2500.0       # grid spacing meters
GRID_NX = 949
GRID_NY = 1069

THREDDS_BASE = "https://thredds.met.no/thredds/dodsC/mepslatest"


def latlon_to_lambert(lat, lon):
    """Convert WGS84 lat/lon to MEPS Lambert x,y in meters."""
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    lat0_r = math.radians(LAT0)
    lon0_r = math.radians(LON0)
    lat1_r = math.radians(LAT1)

    n = math.sin(lat1_r)
    F = (math.cos(lat1_r) * math.tan(math.pi / 4 + lat1_r / 2) ** n) / n
    rho0 = R * F / math.tan(math.pi / 4 + lat0_r / 2) ** n
    rho = R * F / math.tan(math.pi / 4 + lat_r / 2) ** n

    x = rho * math.sin(n * (lon_r - lon0_r))
    y = rho0 - rho * math.cos(n * (lon_r - lon0_r))
    return x, y


def latlon_to_grid(lat, lon):
    """Convert lat/lon to nearest MEPS grid indices."""
    x, y = latlon_to_lambert(lat, lon)
    xi = round((x - GRID_X0) / GRID_DX)
    yi = round((y - GRID_Y0) / GRID_DX)
    xi = max(0, min(xi, GRID_NX - 1))
    yi = max(0, min(yi, GRID_NY - 1))
    return xi, yi


def find_latest_file():
    """Find the latest MEPS subset file on THREDDS."""
    now = datetime.now(timezone.utc)
    # Try recent runs: current hour rounded down to nearest 3h, then go back
    for hours_back in range(0, 24, 3):
        h = now.hour - hours_back
        if h < 0:
            # Previous day
            dt = datetime(now.year, now.month, now.day - 1,
                          (24 + h) // 3 * 3, 0, 0, tzinfo=timezone.utc)
        else:
            dt = datetime(now.year, now.month, now.day,
                          h // 3 * 3, 0, 0, tzinfo=timezone.utc)
        if dt > now:
            continue
        fname = f"meps_lagged_6_h_subset_2_5km_{dt.strftime('%Y%m%dT%H')}Z.ncml"
        url = f"{THREDDS_BASE}/{fname}.dds"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PowPredictor/1.0"})
            urllib.request.urlopen(req, timeout=5)
            return fname
        except Exception:
            continue
    return None


def fetch_opendap(fname, query):
    """Fetch ASCII data from OPeNDAP."""
    url = f"{THREDDS_BASE}/{fname}.ascii?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "PowPredictor/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8")


def parse_1d_values(text, varname):
    """Parse a 1D array from OPeNDAP ASCII response."""
    values = []
    lines = text.split("\n")
    capture = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if capture:
                break
            continue
        # Start capturing after the dimension line like "varname.varname[N]"
        if f"{varname}.{varname}[" in stripped or (f"{varname}[" in stripped and "ARRAY" not in stripped and "Grid" not in stripped and "Float" not in stripped and "Int" not in stripped):
            capture = True
            continue
        if capture:
            for part in stripped.split(","):
                part = part.strip()
                if not part:
                    continue
                # Remove [idx] prefix if present
                m = re.match(r"(?:\[\d+\])+,?\s*(.+)", part)
                if m:
                    part = m.group(1).strip()
                try:
                    values.append(float(part))
                except ValueError:
                    pass
    return values


def fetch_wind_at_point(fname, lat, lng, num_times=8):
    """Fetch wind data for a single grid point."""
    xi, yi = latlon_to_grid(lat, lng)

    t_end = min(num_times - 1, 61)  # max 62 timesteps in MEPS
    q = (
        f"x_wind_10m[0:{t_end}][0][0][{yi}][{xi}],"
        f"y_wind_10m[0:{t_end}][0][0][{yi}][{xi}],"
        f"wind_speed_of_gust[0:{t_end}][0][0][{yi}][{xi}],"
        f"x_wind_pl[0:{t_end}][3][0][{yi}][{xi}],"
        f"y_wind_pl[0:{t_end}][3][0][{yi}][{xi}],"
        f"latitude[{yi}][{xi}],"
        f"longitude[{yi}][{xi}],"
        f"time[0:{t_end}]"
    )

    data = fetch_opendap(fname, q)

    x10_vals = parse_1d_values(data, "x_wind_10m")
    y10_vals = parse_1d_values(data, "y_wind_10m")
    gust_vals = parse_1d_values(data, "wind_speed_of_gust")
    x850_vals = parse_1d_values(data, "x_wind_pl")
    y850_vals = parse_1d_values(data, "y_wind_pl")
    lat_val = parse_1d_values(data, "latitude")
    lon_val = parse_1d_values(data, "longitude")
    time_vals = parse_1d_values(data, "time")

    n = min(len(x10_vals), len(y10_vals), len(gust_vals),
            len(x850_vals), len(y850_vals))

    wind_speed_10m = []
    wind_dir_10m = []
    wind_speed_850 = []
    wind_dir_850 = []
    wind_gust = []
    timestamps = []

    for i in range(n):
        spd10 = math.sqrt(x10_vals[i] ** 2 + y10_vals[i] ** 2)
        dir10 = (270 - math.degrees(math.atan2(y10_vals[i], x10_vals[i]))) % 360
        wind_speed_10m.append(round(spd10, 2))
        wind_dir_10m.append(round(dir10, 1))

        spd850 = math.sqrt(x850_vals[i] ** 2 + y850_vals[i] ** 2)
        dir850 = (270 - math.degrees(math.atan2(y850_vals[i], x850_vals[i]))) % 360
        wind_speed_850.append(round(spd850, 2))
        wind_dir_850.append(round(dir850, 1))

        wind_gust.append(round(gust_vals[i], 2))

        if i < len(time_vals):
            timestamps.append(int(time_vals[i] * 1000))  # epoch ms

    return {
        "lat": lat_val[0] if lat_val else lat,
        "lng": lon_val[0] if lon_val else lng,
        "gridX": xi,
        "gridY": yi,
        "timestamps": timestamps,
        "windSpeed10m": wind_speed_10m,
        "windDir10m": wind_dir_10m,
        "windSpeed850hPa": wind_speed_850,
        "windDir850hPa": wind_dir_850,
        "windGust": wind_gust,
    }


def lambda_handler(event, context):
    qs = event.get("queryStringParameters") or {}

    try:
        num_times = int(qs.get("hours", "24"))

        if "points" in qs:
            pairs = qs["points"].split(";")
            points = []
            for pair in pairs:
                parts = pair.strip().split(",")
                points.append((float(parts[0]), float(parts[1])))
        elif "lat" in qs and "lng" in qs:
            points = [(float(qs["lat"]), float(qs["lng"]))]
        else:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Provide lat+lng or points parameter"}),
            }

        fname = find_latest_file()
        if not fname:
            return {
                "statusCode": 502,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "No MEPS data available on THREDDS"}),
            }

        # Fetch each point individually to avoid massive OPeNDAP queries
        results = []
        for lat, lng in points:
            results.append(fetch_wind_at_point(fname, lat, lng, num_times))

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
            },
            "body": json.dumps({
                "source": fname,
                "model": "MEPS 2.5km",
                "stations": results,
            }),
        }

    except Exception as e:
        import traceback
        return {
            "statusCode": 502,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e), "trace": traceback.format_exc()}),
        }

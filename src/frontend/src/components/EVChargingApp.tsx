import {
  BatteryCharging,
  BookOpen,
  Locate,
  Navigation,
  RefreshCw,
  Search,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
// Leaflet is loaded via CDN in index.html — L is a global
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../leaflet-global.d.ts" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookingSuccess } from "./BookingSuccess";
import { MyBookings } from "./MyBookings";
import { type BookingConfirmation, SlotBooking } from "./SlotBooking";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UIStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  chargingTypes: string[];
  isAvailable: boolean;
}

interface VehicleInfo {
  name: string;
  batteryCapacityKwh: number;
  currentChargePercent: number;
}

// ─── Charging time estimates ──────────────────────────────────────────────────
// kW power output per charging type
const CHARGING_POWER_KW: Record<string, number> = {
  "Fast Charging": 50, // DC fast charger ~50kW
  "Slow Charging": 7.4, // AC Level 2 ~7.4kW
  "Battery Swapping": 0, // instant swap
};

function estimateChargeTime(
  vehicle: VehicleInfo,
  chargingType: string,
): string {
  if (chargingType === "Battery Swapping") return "~5 minutes (instant swap)";
  const powerKw = CHARGING_POWER_KW[chargingType] ?? 7.4;
  const neededKwh =
    vehicle.batteryCapacityKwh * ((100 - vehicle.currentChargePercent) / 100);
  const hours = neededKwh / powerKw;
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `~${mins} minutes`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `~${h} hr ${m} min` : `~${h} hour${h > 1 ? "s" : ""}`;
}

// ─── Station fetching via OpenStreetMap Overpass (primary, no key needed) ─────
// Also tries multiple Overpass mirrors for reliability

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Known real stations confirmed by users — always shown regardless of API results
const KNOWN_SEED_STATIONS: UIStation[] = [
  {
    id: "known-ather-bailhongal",
    name: "Ather Grid Charging Station",
    lat: 15.9795,
    lng: 74.8573,
    chargingTypes: ["Fast Charging", "Slow Charging"],
    isAvailable: true,
  },
];

function buildOverpassQuery(lat: number, lng: number, radiusM: number) {
  return `[out:json][timeout:30];
(
  node["amenity"="charging_station"](around:${radiusM},${lat},${lng});
  way["amenity"="charging_station"](around:${radiusM},${lat},${lng});
  relation["amenity"="charging_station"](around:${radiusM},${lat},${lng});
  node["ev_charging"="yes"](around:${radiusM},${lat},${lng});
  node["amenity"="fuel"]["ev_charging"="yes"](around:${radiusM},${lat},${lng});
  node["amenity"="service_station"](around:${radiusM},${lat},${lng});
);
out body center 30;`;
}

function overpassTagsToChargingTypes(tags: Record<string, string>): string[] {
  const socket = (
    tags["socket:type2"] ||
    tags["socket:chademo"] ||
    tags["socket:type2_combo"] ||
    tags.socket ||
    ""
  ).toLowerCase();
  const maxPower = Number(
    tags["charging:maxpower"] || tags.maxpower || tags["socket:output"] || 0,
  );
  const types = new Set<string>();

  if (
    tags["socket:chademo"] ||
    tags["socket:type2_combo"] ||
    socket.includes("chademo") ||
    socket.includes("ccs") ||
    socket.includes("combo") ||
    maxPower >= 22
  ) {
    types.add("Fast Charging");
  }
  if (
    tags["socket:type2"] ||
    socket.includes("type2") ||
    socket.includes("schuko") ||
    socket.includes("type1")
  ) {
    types.add("Slow Charging");
  }
  if (
    socket.includes("swap") ||
    (tags.operator || "").toLowerCase().includes("sun mob")
  ) {
    types.add("Battery Swapping");
  }
  if (types.size === 0) types.add("Slow Charging");
  return Array.from(types);
}

async function fetchRealStations(
  lat: number,
  lng: number,
): Promise<UIStation[]> {
  // Try progressively wider radii: 10 km, then 25 km, then 50 km
  const radii = [10000, 25000, 50000];
  let fetchedStations: UIStation[] = [];

  for (const radius of radii) {
    const query = buildOverpassQuery(lat, lng, radius);

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) continue;

        const data = await res.json();
        const elements: Array<{
          id: number;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }> = data?.elements ?? [];

        if (elements.length === 0) continue;

        const stations: UIStation[] = elements
          .map((el, idx) => {
            const elLat = el.lat ?? el.center?.lat;
            const elLng = el.lon ?? el.center?.lon;
            if (!elLat || !elLng) return null;
            const tags = el.tags ?? {};
            const name =
              tags.name ||
              tags["name:en"] ||
              tags.brand ||
              tags.operator ||
              `EV Station ${idx + 1}`;
            return {
              id: `osm-${el.id}`,
              name,
              lat: elLat,
              lng: elLng,
              chargingTypes: overpassTagsToChargingTypes(tags),
              isAvailable:
                tags.operational_status !== "closed" && tags.access !== "no",
            } as UIStation;
          })
          .filter((s): s is UIStation => s !== null);

        if (stations.length > 0) {
          fetchedStations = stations;
          break; // found stations at this endpoint
        }
      } catch {
        // try next endpoint
      }
      if (fetchedStations.length > 0) break;
    }
    if (fetchedStations.length > 0) break; // found stations at this radius
  }

  // If Overpass found nothing, try OCM as last resort
  if (fetchedStations.length === 0) {
    try {
      const url = new URL("https://api.openchargemap.io/v3/poi/");
      url.searchParams.set("output", "json");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lng));
      url.searchParams.set("distance", "50");
      url.searchParams.set("distanceunit", "km");
      url.searchParams.set("maxresults", "30");
      url.searchParams.set("compact", "false");
      url.searchParams.set("verbose", "false");

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data: Array<{
          ID: number;
          AddressInfo: { Title: string; Latitude: number; Longitude: number };
          StatusType?: { IsOperational?: boolean };
          Connections?: Array<{
            ConnectionType?: { FormalName?: string; Title?: string };
            LevelID?: number;
            PowerKW?: number;
          }>;
        }> = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          fetchedStations = data.map((item, idx) => {
            const types = new Set<string>();
            for (const conn of item.Connections ?? []) {
              const name = (
                conn.ConnectionType?.FormalName ??
                conn.ConnectionType?.Title ??
                ""
              ).toLowerCase();
              const level = conn.LevelID ?? 0;
              const kw = conn.PowerKW ?? 0;
              if (
                name.includes("chademo") ||
                name.includes("ccs") ||
                name.includes("combo") ||
                name.includes("dc") ||
                level === 3 ||
                kw >= 22
              ) {
                types.add("Fast Charging");
              } else {
                types.add("Slow Charging");
              }
            }
            if (types.size === 0) types.add("Slow Charging");
            return {
              id: String(item.ID ?? idx + 1),
              name: item.AddressInfo?.Title ?? `EV Station ${idx + 1}`,
              lat: item.AddressInfo.Latitude,
              lng: item.AddressInfo.Longitude,
              chargingTypes: Array.from(types),
              isAvailable: item.StatusType?.IsOperational !== false,
            };
          });
        }
      }
    } catch {
      // OCM also failed — will fall back to seed stations
    }
  }

  // Merge seed stations: include seeds that are NOT already in fetchedStations
  // (deduplicate by proximity — if within 0.1 km of a fetched station, skip the seed)
  const seedsToAdd = KNOWN_SEED_STATIONS.filter((seed) => {
    return !fetchedStations.some(
      (fetched) =>
        haversineDistance(seed.lat, seed.lng, fetched.lat, fetched.lng) < 0.1,
    );
  });

  return [...fetchedStations, ...seedsToAdd];
}

// ─── Haversine distance (km) ──────────────────────────────────────────────────
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Map helpers ──────────────────────────────────────────────────────────────
function createStationIcon(isAvailable: boolean, isSelected: boolean) {
  const size = isSelected ? 42 : 36;
  const bg = isAvailable ? (isSelected ? "#16a34a" : "#22c55e") : "#ef4444";
  const shadow = isSelected
    ? "0 0 0 4px rgba(34,197,94,0.25), 0 4px 12px rgba(0,0,0,0.25)"
    : "0 2px 8px rgba(0,0,0,0.2)";

  const html = `<div style="
    width:${size}px;height:${size}px;
    background:${bg};
    border:3px solid #fff;
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    box-shadow:${shadow};
    transition:all 0.2s;
    font-size:${isSelected ? 18 : 15}px;
    line-height:1;
  ">⚡</div>`;

  return L.divIcon({
    html,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

function createUserIcon() {
  const html = `<div class="user-location-marker">
    <div class="user-location-ring"></div>
    <div class="user-location-ring2"></div>
    <div class="user-location-dot"></div>
  </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ─── Charging type config ─────────────────────────────────────────────────────
const CHARGING_CONFIGS: Record<
  string,
  { icon: string; description: string; color: string; ocid: string }
> = {
  "Fast Charging": {
    icon: "⚡",
    description: "DC fast charge — 50 kW",
    color: "#f59e0b",
    ocid: "charging.fast_button",
  },
  "Slow Charging": {
    icon: "🔋",
    description: "AC slow charge — 7.4 kW",
    color: "#22c55e",
    ocid: "charging.slow_button",
  },
  "Battery Swapping": {
    icon: "🔄",
    description: "Swap battery in ~5 min",
    color: "#3b82f6",
    ocid: "charging.swap_button",
  },
};

// Popular EV models with battery capacity
const EV_PRESETS: { label: string; capacityKwh: number }[] = [
  { label: "Tata Nexon EV (30 kWh)", capacityKwh: 30 },
  { label: "Tata Nexon EV Max (40 kWh)", capacityKwh: 40 },
  { label: "MG ZS EV (50 kWh)", capacityKwh: 50 },
  { label: "Hyundai Kona EV (39 kWh)", capacityKwh: 39 },
  { label: "BYD Atto 3 (60 kWh)", capacityKwh: 60 },
  { label: "Ola S1 Pro (3.97 kWh)", capacityKwh: 3.97 },
  { label: "Ather 450X (2.9 kWh)", capacityKwh: 2.9 },
  { label: "Tesla Model 3 (75 kWh)", capacityKwh: 75 },
  { label: "Custom", capacityKwh: 0 },
];

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]; // India center as fallback
const DEFAULT_ZOOM = 5;

// ─── Step types ───────────────────────────────────────────────────────────────
type ModalStep =
  | "charging-type"
  | "vehicle-registration"
  | "slot-booking"
  | "booking-success";

// ─── Main Component ───────────────────────────────────────────────────────────
export function EVChargingApp() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routingControlRef = useRef<L.Routing.Control | null>(null);
  const stationMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const stationListRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const stationsFetchedRef = useRef(false); // prevent duplicate fetches
  const lastFetchLocRef = useRef<[number, number] | null>(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "success" | "denied" | "unavailable"
  >("loading");
  const [stations, setStations] = useState<UIStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [stationsFetchError, setStationsFetchError] = useState(false);
  const [selectedStation, setSelectedStation] = useState<UIStation | null>(
    null,
  );
  const [hasRoute, setHasRoute] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Bottom sheet
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Modal flow
  const [modalStation, setModalStation] = useState<UIStation | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>("charging-type");
  const [selectedChargingType, setSelectedChargingType] = useState<string>("");

  // Vehicle registration
  const [vehicleType, setVehicleType] = useState<"bike" | "car" | "other">(
    "car",
  );
  const [vehiclePresetIdx, setVehiclePresetIdx] = useState(0);
  const [vehicleName, setVehicleName] = useState("");
  const [customCapacity, setCustomCapacity] = useState("");
  const [currentCharge, setCurrentCharge] = useState("20");

  // (chargeTimeEstimate and registrationId removed — slot booking flow replaces old "confirmed" step)
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(30);

  // Booking confirmation
  const [bookingConfirmation, setBookingConfirmation] =
    useState<BookingConfirmation | null>(null);

  // My Bookings panel
  const [myBookingsOpen, setMyBookingsOpen] = useState(false);

  // Station name map for my bookings panel
  const stationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stations) {
      map.set(s.id, s.name);
    }
    return map;
  }, [stations]);

  // ─── Load stations (reusable, called on GPS fix or manual refresh) ──────────
  const loadStations = useCallback((loc: [number, number]) => {
    // Show seed stations immediately so the user always sees at least the known station
    setStations(KNOWN_SEED_STATIONS);
    setSheetExpanded(true);
    setStationsLoading(true);
    setStationsFetchError(false);
    stationsFetchedRef.current = true;
    lastFetchLocRef.current = loc;
    fetchRealStations(loc[0], loc[1]).then((real) => {
      setStationsLoading(false);
      // real always includes seed stations (merged inside fetchRealStations)
      if (real.length > 0) {
        setStations(real);
        setSheetExpanded(true);
        if (mapRef.current) {
          // Zoom to show user + nearest stations
          const nearest = real.slice(0, 5);
          if (nearest.length > 0) {
            let minLat = loc[0];
            let maxLat = loc[0];
            let minLng = loc[1];
            let maxLng = loc[1];
            for (const s of nearest) {
              if (s.lat < minLat) minLat = s.lat;
              if (s.lat > maxLat) maxLat = s.lat;
              if (s.lng < minLng) minLng = s.lng;
              if (s.lng > maxLng) maxLng = s.lng;
            }
            const bounds = L.latLngBounds(
              L.latLng(minLat - 0.005, minLng - 0.005),
              L.latLng(maxLat + 0.005, maxLng + 0.005),
            );
            mapRef.current.fitBounds(bounds, { padding: [60, 60] });
          }
        }
      } else {
        // Seeds are always included in real, but if somehow empty (shouldn't happen),
        // still show seeds and don't show an error
        setStations(KNOWN_SEED_STATIONS);
        setSheetExpanded(true);
      }
    });
  }, []);

  // Sorted + filtered stations
  const sortedStations = stations
    .map((s) => ({
      ...s,
      distance: userLocation
        ? haversineDistance(userLocation[0], userLocation[1], s.lat, s.lng)
        : null,
    }))
    .sort((a, b) => {
      if (a.distance === null || b.distance === null) return 0;
      return a.distance - b.distance;
    });

  const filteredStations = sortedStations.filter(
    (s) =>
      searchQuery === "" ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ─── Map init ───────────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: map init runs once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: "abc",
      maxZoom: 19,
      keepBuffer: 4,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize({ animate: false }), 100);
    setTimeout(() => map.invalidateSize({ animate: false }), 500);

    if (navigator.geolocation) {
      setLocationStatus("loading");
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc: [number, number] = [
            pos.coords.latitude,
            pos.coords.longitude,
          ];
          setUserLocation(loc);
          setLocationStatus("success");

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(loc);
          } else {
            const userMarker = L.marker(loc, {
              icon: createUserIcon(),
              zIndexOffset: 2000,
            }).addTo(map);
            userMarkerRef.current = userMarker;
            map.flyTo(loc, 15, { duration: 1.5 });
          }

          // Fetch real stations near user on first GPS fix (only once)
          if (!stationsFetchedRef.current) {
            loadStations(loc);
          }
        },
        (err) => {
          setLocationStatus(
            err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
          );
          // Try fetching real stations at default center if no GPS
          if (!stationsFetchedRef.current) {
            loadStations(DEFAULT_CENTER);
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
      );
      watchIdRef.current = watchId;
    } else {
      setLocationStatus("unavailable");
      loadStations(DEFAULT_CENTER);
    }

    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      if (routingControlRef.current) routingControlRef.current.remove();
      stationMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sync station markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || stations.length === 0) return;
    const map = mapRef.current;

    // Remove all old markers
    for (const marker of stationMarkersRef.current.values()) {
      marker.remove();
    }
    stationMarkersRef.current.clear();

    for (const station of stations) {
      const popupEl = document.createElement("div");
      popupEl.className = "station-popup";
      popupEl.innerHTML = `
        <h3>${station.name}</h3>
        <div>
          <span class="${station.isAvailable ? "badge-available" : "badge-unavailable"}">
            ${station.isAvailable ? "● Open" : "● Full"}
          </span>
        </div>
        <div class="charging-types">${station.chargingTypes.join(" · ")}</div>
        <button class="popup-navigate-btn" data-station-id="${station.id}">
          📍 Select Station
        </button>
      `;

      const marker = L.marker([station.lat, station.lng], {
        icon: createStationIcon(station.isAvailable, false),
      }).addTo(map);

      marker.bindPopup(L.popup({ maxWidth: 240 }).setContent(popupEl));

      marker.on("click", () => {
        setSelectedStation(station);
        setSheetExpanded(true);
        setTimeout(() => {
          cardRefs.current.get(station.id)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }, 200);
      });

      stationMarkersRef.current.set(station.id, marker);
    }
  }, [stations]);

  // ─── Popup button delegation ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest(
        "[data-station-id]",
      ) as HTMLElement | null;
      if (!btn) return;
      const sid = btn.getAttribute("data-station-id");
      const station = stations.find((s) => s.id === sid);
      if (station) openChargingModal(station);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations]);

  // Update marker icons when selection changes
  useEffect(() => {
    for (const station of stations) {
      const marker = stationMarkersRef.current.get(station.id);
      if (marker) {
        marker.setIcon(
          createStationIcon(
            station.isAvailable,
            station.id === selectedStation?.id,
          ),
        );
      }
    }
  }, [selectedStation, stations]);

  // ─── Modal helpers ───────────────────────────────────────────────────────────
  const openChargingModal = useCallback((station: UIStation) => {
    setModalStation(station);
    setModalStep("charging-type");
    setSelectedChargingType("");
    setVehicleType("car");
    setVehiclePresetIdx(0);
    setVehicleName("");
    setCustomCapacity("");
    setCurrentCharge("20");
    setBookingConfirmation(null);
    setSelectedStation(station);
  }, []);

  const handleChargingTypeSelect = useCallback((type: string) => {
    setSelectedChargingType(type);
    setModalStep("vehicle-registration");
  }, []);

  const handleVehicleRegister = useCallback(() => {
    if (!modalStation) return;
    const preset = EV_PRESETS[vehiclePresetIdx];
    const capacityKwh =
      preset.label === "Custom"
        ? Number.parseFloat(customCapacity) || 30
        : preset.capacityKwh;
    const chargePercent = Math.max(
      0,
      Math.min(100, Number.parseInt(currentCharge) || 20),
    );

    // Calculate duration in minutes from estimate string
    let durationMins = 30;
    if (selectedChargingType === "Battery Swapping") {
      durationMins = 5;
    } else {
      const powerKw = selectedChargingType === "Fast Charging" ? 50 : 7.4;
      const neededKwh = capacityKwh * ((100 - chargePercent) / 100);
      durationMins = Math.max(5, Math.round((neededKwh / powerKw) * 60));
    }
    setEstimatedDurationMinutes(durationMins);

    // Go to slot booking step instead of directly confirming
    setModalStep("slot-booking");
  }, [
    modalStation,
    vehiclePresetIdx,
    customCapacity,
    currentCharge,
    selectedChargingType,
  ]);

  // ─── Draw route ──────────────────────────────────────────────────────────────
  const drawRoute = useCallback(
    (station: UIStation, chargingType: string) => {
      if (!mapRef.current || !userLocation) {
        toast.error("Waiting for GPS location...");
        return;
      }

      if (routingControlRef.current) {
        routingControlRef.current.remove();
        routingControlRef.current = null;
      }

      const control = L.Routing.control({
        waypoints: [
          L.latLng(userLocation[0], userLocation[1]),
          L.latLng(station.lat, station.lng),
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false,
        lineOptions: {
          styles: [
            { color: "#1a73e8", weight: 5, opacity: 0.9 },
            { color: "#4ca3f5", weight: 3, opacity: 0.5 },
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 10,
        },
        router: L.Routing.osrmv1({
          serviceUrl: "https://router.project-osrm.org/route/v1",
        }),
        plan: L.Routing.plan(
          [
            L.latLng(userLocation[0], userLocation[1]),
            L.latLng(station.lat, station.lng),
          ],
          { createMarker: () => false as unknown as L.Marker },
        ),
      });

      control.addTo(mapRef.current);
      routingControlRef.current = control;
      setHasRoute(true);
      setSheetExpanded(false);

      toast.success(`Navigating to ${station.name}`, {
        description: chargingType,
        duration: 4000,
      });
    },
    [userLocation],
  );

  const handleClearRoute = useCallback(() => {
    if (routingControlRef.current && mapRef.current) {
      routingControlRef.current.remove();
      routingControlRef.current = null;
    }
    setHasRoute(false);
    setSelectedStation(null);
    if (mapRef.current) {
      mapRef.current.flyTo(
        userLocation ?? DEFAULT_CENTER,
        userLocation ? 14 : DEFAULT_ZOOM,
        {
          duration: 1.0,
        },
      );
    }
  }, [userLocation]);

  const handleLocateMe = useCallback(() => {
    if (mapRef.current && userLocation) {
      mapRef.current.flyTo(userLocation, 15, { duration: 1.2 });
    } else {
      toast.info("Waiting for GPS signal...");
    }
  }, [userLocation]);

  const handleSelectStation = useCallback(
    (station: UIStation) => {
      openChargingModal(station);
      setSheetExpanded(false);
      if (mapRef.current) {
        mapRef.current.flyTo([station.lat, station.lng], 15, { duration: 1.0 });
      }
    },
    [openChargingModal],
  );

  const year = new Date().getFullYear();
  const selectedPreset = EV_PRESETS[vehiclePresetIdx];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* ── Map container ── */}
      <div
        ref={mapContainerRef}
        data-ocid="map.canvas_target"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
        }}
      />

      {/* ── Search bar (top overlay) ── */}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(520px, calc(100vw - 24px))",
          zIndex: 500,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 28,
            boxShadow: "0 2px 12px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            padding: "0 8px 0 16px",
            height: 52,
            gap: 8,
          }}
        >
          <Search size={18} color="#9ca3af" style={{ flexShrink: 0 }} />
          <input
            data-ocid="search.search_input"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!sheetExpanded) setSheetExpanded(true);
            }}
            placeholder="Search EV charging stations..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 14,
              fontFamily: "Sora, system-ui, sans-serif",
              fontWeight: 500,
              color: "#1f2937",
              background: "transparent",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
                color: "#9ca3af",
              }}
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            data-ocid="location.button"
            onClick={handleLocateMe}
            title="Locate me"
            style={{
              background: locationStatus === "success" ? "#e8f5e9" : "#f3f4f6",
              border: "none",
              borderRadius: 20,
              padding: "6px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: locationStatus === "success" ? "#16a34a" : "#6b7280",
              transition: "background 0.15s",
              flexShrink: 0,
              fontFamily: "Sora, system-ui, sans-serif",
            }}
          >
            <Locate size={15} />
          </button>
        </div>
      </div>

      {/* ── Active Route Chip ── */}
      <AnimatePresence>
        {hasRoute && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            style={{
              position: "fixed",
              top: 76,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 500,
            }}
          >
            <button
              type="button"
              data-ocid="route.cancel_button"
              onClick={handleClearRoute}
              style={{
                background: "#1a73e8",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "Sora, system-ui, sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(26,115,232,0.4)",
              }}
            >
              <X size={14} />
              Clear Route
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom sheet ── */}
      <div
        className="bottom-sheet"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 400,
          transform: sheetExpanded
            ? "translateY(0)"
            : "translateY(calc(100% - 220px))",
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
          maxHeight: "68vh",
          display: "flex",
          flexDirection: "column",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Drag handle + header */}
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "12px 16px 8px",
            flexShrink: 0,
            textAlign: "left",
            width: "100%",
          }}
          aria-label={sheetExpanded ? "Collapse list" : "Expand list"}
        >
          <div
            style={{
              width: 40,
              height: 4,
              background: "#d1d5db",
              borderRadius: 2,
              margin: "0 auto 12px",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  background: "#e8f5e9",
                  borderRadius: 10,
                  padding: "5px 7px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Zap size={16} color="#16a34a" />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#1f2937",
                    fontFamily: "Sora, system-ui, sans-serif",
                  }}
                >
                  {searchQuery
                    ? `${filteredStations.length} stations found`
                    : "Nearby EV Stations"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    fontFamily: "Sora, system-ui, sans-serif",
                  }}
                >
                  {userLocation
                    ? "Sorted by distance from you"
                    : "Allow location for nearby stations"}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#1a73e8",
                fontFamily: "Sora, system-ui, sans-serif",
                padding: "4px 10px",
                background: "#e8f0fe",
                borderRadius: 12,
              }}
            >
              {sheetExpanded ? "Collapse" : "Show all"}
            </div>
            <button
              type="button"
              data-ocid="station.refresh_button"
              title="Refresh stations"
              onClick={(e) => {
                e.stopPropagation();
                stationsFetchedRef.current = false;
                const loc =
                  lastFetchLocRef.current ?? userLocation ?? DEFAULT_CENTER;
                loadStations(loc);
                toast.info("Refreshing nearby stations...");
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
                color: "#6b7280",
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </button>

        {/* Stations list */}
        <div
          ref={stationListRef}
          style={{
            overflowY: "auto",
            flex: 1,
            padding: "4px 12px 0",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {stationsLoading && (
            <div
              data-ocid="station.loading_state"
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "#6b7280",
                fontFamily: "Sora, system-ui, sans-serif",
                fontSize: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "3px solid #1a73e8",
                  borderTopColor: "transparent",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Fetching real nearby EV stations...
            </div>
          )}

          {!stationsLoading && stationsFetchError && (
            <div
              data-ocid="station.error_state"
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "#dc2626",
                fontFamily: "Sora, system-ui, sans-serif",
                fontSize: 13,
                lineHeight: 1.6,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span>
                Could not find stations nearby. Check your internet connection.
              </span>
              <button
                type="button"
                data-ocid="station.retry_button"
                onClick={() => {
                  stationsFetchedRef.current = false;
                  const loc =
                    lastFetchLocRef.current ?? userLocation ?? DEFAULT_CENTER;
                  loadStations(loc);
                }}
                style={{
                  background: "#1a73e8",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Sora, system-ui, sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {!stationsLoading &&
            !stationsFetchError &&
            filteredStations.length === 0 &&
            stations.length === 0 && (
              <div
                data-ocid="station.loading_state"
                style={{
                  textAlign: "center",
                  padding: "32px 16px",
                  color: "#9ca3af",
                  fontFamily: "Sora, system-ui, sans-serif",
                  fontSize: 14,
                }}
              >
                Getting your location to find nearby stations...
              </div>
            )}

          {filteredStations.length === 0 && stations.length > 0 && (
            <div
              data-ocid="station.empty_state"
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "#9ca3af",
                fontFamily: "Sora, system-ui, sans-serif",
                fontSize: 14,
              }}
            >
              No stations match your search
            </div>
          )}

          {filteredStations.map((station, index) => {
            const ocidIndex = index + 1;
            const isSelected = selectedStation?.id === station.id;
            const distStr =
              station.distance !== null
                ? station.distance < 1
                  ? `${Math.round(station.distance * 1000)} m away`
                  : `${station.distance.toFixed(1)} km away`
                : "--";

            return (
              <button
                key={station.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(station.id, el);
                }}
                type="button"
                data-ocid={`station.item.${ocidIndex}`}
                onClick={() => handleSelectStation(station)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  background: isSelected ? "#f0fdf4" : "#fff",
                  border: `1.5px solid ${isSelected ? "#86efac" : "#f3f4f6"}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  marginBottom: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  boxShadow: isSelected
                    ? "0 2px 8px rgba(34,197,94,0.12)"
                    : "0 1px 4px rgba(0,0,0,0.04)",
                  gap: 12,
                  fontFamily: "Sora, system-ui, sans-serif",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: station.isAvailable ? "#f0fdf4" : "#fef2f2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                    border: `1px solid ${station.isAvailable ? "#bbf7d0" : "#fecaca"}`,
                  }}
                >
                  ⚡
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#1f2937",
                      marginBottom: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {station.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        fontWeight: 500,
                      }}
                    >
                      {distStr}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 9999,
                        background: station.isAvailable ? "#dcfce7" : "#fee2e2",
                        color: station.isAvailable ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {station.isAvailable ? "Open" : "Full"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      marginTop: 5,
                      flexWrap: "wrap",
                    }}
                  >
                    {station.chargingTypes.map((type) => {
                      const cfg = CHARGING_CONFIGS[type];
                      return (
                        <span
                          key={type}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: 6,
                            background: `${cfg.color}18`,
                            color: cfg.color,
                            border: `1px solid ${cfg.color}40`,
                          }}
                        >
                          {cfg.icon} {type}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectStation(station);
                  }}
                  style={{
                    background: "#1a73e8",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                  title="Navigate"
                >
                  <Navigation size={16} />
                </button>
              </button>
            );
          })}

          <div
            style={{
              textAlign: "center",
              padding: "12px 0 20px",
              fontSize: 11,
              color: "#9ca3af",
              fontFamily: "Sora, system-ui, sans-serif",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "center",
            }}
          >
            <span>
              Station data from{" "}
              <a
                href="https://openchargemap.org"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1a73e8", textDecoration: "none" }}
              >
                Open Charge Map
              </a>{" "}
              &{" "}
              <a
                href="https://www.openstreetmap.org"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1a73e8", textDecoration: "none" }}
              >
                OpenStreetMap
              </a>
            </span>
            <span>
              © {year}.{" "}
              <a
                href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1a73e8", textDecoration: "none" }}
              >
                Built with ❤️ using caffeine.ai
              </a>
            </span>
          </div>
        </div>
      </div>

      {/* ── My Bookings FAB ── */}
      <motion.button
        type="button"
        data-ocid="my_bookings.open_modal_button"
        onClick={() => setMyBookingsOpen(true)}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: "spring", damping: 16 }}
        whileTap={{ scale: 0.93 }}
        style={{
          position: "fixed",
          bottom: 236,
          right: 16,
          zIndex: 450,
          background: "#fff",
          border: "1.5px solid #e5e7eb",
          borderRadius: 16,
          width: 52,
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
          color: "#16a34a",
        }}
        title="My Bookings"
      >
        <BookOpen size={22} />
      </motion.button>

      {/* ── My Bookings Panel ── */}
      <MyBookings
        open={myBookingsOpen}
        onClose={() => setMyBookingsOpen(false)}
        stationNameMap={stationNameMap}
      />

      {/* ── Modal (multi-step) ── */}
      <AnimatePresence>
        {modalStation && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                if (modalStep !== "booking-success") setModalStation(null);
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                zIndex: 800,
              }}
            />

            <motion.div
              data-ocid="charging.dialog"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                background: "#fff",
                borderRadius: "24px 24px 0 0",
                padding: "8px 20px 40px",
                zIndex: 900,
                boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              {/* Handle */}
              <div
                style={{
                  width: 40,
                  height: 4,
                  background: "#d1d5db",
                  borderRadius: 2,
                  margin: "8px auto 20px",
                }}
              />

              {/* Step 1: Choose charging type */}
              {modalStep === "charging-type" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 20,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#1f2937",
                          fontFamily: "Sora, system-ui, sans-serif",
                          marginBottom: 4,
                        }}
                      >
                        Choose Charging Type
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6b7280",
                          fontFamily: "Sora, system-ui, sans-serif",
                        }}
                      >
                        {modalStation.name}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-ocid="charging.close_button"
                      onClick={() => setModalStation(null)}
                      style={{
                        background: "#f3f4f6",
                        border: "none",
                        borderRadius: "50%",
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#6b7280",
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {modalStation.chargingTypes.map((type) => {
                      const cfg = CHARGING_CONFIGS[type];
                      return (
                        <motion.button
                          key={type}
                          type="button"
                          data-ocid={cfg.ocid}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleChargingTypeSelect(type)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            padding: "16px 18px",
                            borderRadius: 16,
                            border: `2px solid ${cfg.color}30`,
                            borderLeft: `5px solid ${cfg.color}`,
                            background: `${cfg.color}08`,
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                            fontFamily: "Sora, system-ui, sans-serif",
                          }}
                        >
                          <div
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 14,
                              background: `${cfg.color}18`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 26,
                              flexShrink: 0,
                              border: `1.5px solid ${cfg.color}35`,
                            }}
                          >
                            {cfg.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#1f2937",
                                marginBottom: 3,
                              }}
                            >
                              {type}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                              {cfg.description}
                            </div>
                          </div>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: cfg.color,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Navigation size={13} color="#fff" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Step 2: Vehicle registration */}
              {modalStep === "vehicle-registration" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 20,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#1f2937",
                          fontFamily: "Sora, system-ui, sans-serif",
                          marginBottom: 4,
                        }}
                      >
                        Register Your Vehicle
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6b7280",
                          fontFamily: "Sora, system-ui, sans-serif",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 8,
                            background: `${CHARGING_CONFIGS[selectedChargingType]?.color ?? "#888"}18`,
                            color:
                              CHARGING_CONFIGS[selectedChargingType]?.color ??
                              "#888",
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          {CHARGING_CONFIGS[selectedChargingType]?.icon}{" "}
                          {selectedChargingType}
                        </span>
                        <span>at {modalStation.name}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalStep("charging-type")}
                      style={{
                        background: "#f3f4f6",
                        border: "none",
                        borderRadius: "50%",
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#6b7280",
                        fontSize: 18,
                      }}
                    >
                      ←
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    {/* Vehicle Type */}
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          fontFamily: "Sora, system-ui, sans-serif",
                          marginBottom: 8,
                        }}
                      >
                        Vehicle Type
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 10,
                        }}
                      >
                        {(
                          [
                            { key: "bike", label: "Bike", icon: "🛵" },
                            { key: "car", label: "Car", icon: "🚗" },
                            {
                              key: "other",
                              label: "Other Vehicle",
                              icon: "🚌",
                            },
                          ] as const
                        ).map(({ key, label, icon }) => (
                          <button
                            key={key}
                            type="button"
                            data-ocid={`vehicle.type_${key}_button`}
                            onClick={() => setVehicleType(key)}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 5,
                              padding: "12px 6px",
                              borderRadius: 12,
                              border: `2px solid ${vehicleType === key ? "#1a73e8" : "#e5e7eb"}`,
                              background:
                                vehicleType === key ? "#e8f0fe" : "#fff",
                              cursor: "pointer",
                              transition: "all 0.15s",
                              fontFamily: "Sora, system-ui, sans-serif",
                            }}
                          >
                            <span style={{ fontSize: 26 }}>{icon}</span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: vehicleType === key ? 700 : 500,
                                color:
                                  vehicleType === key ? "#1a73e8" : "#374151",
                              }}
                            >
                              {label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* EV Model */}
                    <div>
                      <label
                        htmlFor="ev-model-select"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          fontFamily: "Sora, system-ui, sans-serif",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        EV Model
                      </label>
                      <select
                        id="ev-model-select"
                        data-ocid="vehicle.select"
                        value={vehiclePresetIdx}
                        onChange={(e) =>
                          setVehiclePresetIdx(Number.parseInt(e.target.value))
                        }
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1.5px solid #e5e7eb",
                          fontSize: 14,
                          fontFamily: "Sora, system-ui, sans-serif",
                          color: "#1f2937",
                          background: "#fff",
                          outline: "none",
                        }}
                      >
                        {EV_PRESETS.map((p, i) => (
                          <option key={p.label} value={i}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Vehicle name (plate / nickname) */}
                    <div>
                      <label
                        htmlFor="vehicle-name-input"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          fontFamily: "Sora, system-ui, sans-serif",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        Vehicle Number / Name
                      </label>
                      <input
                        id="vehicle-name-input"
                        data-ocid="vehicle.input"
                        type="text"
                        value={vehicleName}
                        onChange={(e) => setVehicleName(e.target.value)}
                        placeholder="e.g. MH12 AB 1234"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1.5px solid #e5e7eb",
                          fontSize: 14,
                          fontFamily: "Sora, system-ui, sans-serif",
                          color: "#1f2937",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {/* Custom capacity if "Custom" */}
                    {selectedPreset.label === "Custom" && (
                      <div>
                        <label
                          htmlFor="vehicle-capacity-input"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#374151",
                            fontFamily: "Sora, system-ui, sans-serif",
                            display: "block",
                            marginBottom: 6,
                          }}
                        >
                          Battery Capacity (kWh)
                        </label>
                        <input
                          id="vehicle-capacity-input"
                          data-ocid="vehicle.capacity_input"
                          type="number"
                          min="1"
                          max="200"
                          value={customCapacity}
                          onChange={(e) => setCustomCapacity(e.target.value)}
                          placeholder="e.g. 40"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1.5px solid #e5e7eb",
                            fontSize: 14,
                            fontFamily: "Sora, system-ui, sans-serif",
                            color: "#1f2937",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}

                    {/* Current charge % */}
                    <div>
                      <label
                        htmlFor="vehicle-battery-input"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          fontFamily: "Sora, system-ui, sans-serif",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        Current Battery Level:{" "}
                        <span style={{ color: "#1a73e8" }}>
                          {currentCharge}%
                        </span>
                      </label>
                      <input
                        id="vehicle-battery-input"
                        data-ocid="vehicle.battery_input"
                        type="range"
                        min="0"
                        max="95"
                        step="5"
                        value={currentCharge}
                        onChange={(e) => setCurrentCharge(e.target.value)}
                        style={{
                          width: "100%",
                          accentColor: "#1a73e8",
                          cursor: "pointer",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: "#9ca3af",
                          fontFamily: "Sora, system-ui, sans-serif",
                          marginTop: 2,
                        }}
                      >
                        <span>0%</span>
                        <span>50%</span>
                        <span>95%</span>
                      </div>
                    </div>

                    {/* Quick preview */}
                    <div
                      style={{
                        background: "#f0f9ff",
                        border: "1px solid #bae6fd",
                        borderRadius: 12,
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <BatteryCharging size={18} color="#0284c7" />
                      <span
                        style={{
                          fontSize: 13,
                          color: "#0369a1",
                          fontWeight: 600,
                          fontFamily: "Sora, system-ui, sans-serif",
                        }}
                      >
                        Estimated charge time:{" "}
                        {estimateChargeTime(
                          {
                            name: vehicleName || selectedPreset.label,
                            batteryCapacityKwh:
                              selectedPreset.label === "Custom"
                                ? Number.parseFloat(customCapacity) || 30
                                : selectedPreset.capacityKwh,
                            currentChargePercent:
                              Number.parseInt(currentCharge) || 20,
                          },
                          selectedChargingType,
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      data-ocid="vehicle.submit_button"
                      onClick={handleVehicleRegister}
                      style={{
                        background: "#1a73e8",
                        color: "#fff",
                        border: "none",
                        borderRadius: 14,
                        padding: "14px",
                        cursor: "pointer",
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: "Sora, system-ui, sans-serif",
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Navigation size={16} />
                      Register &amp; Navigate
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Slot booking */}
              {modalStep === "slot-booking" && (
                <SlotBooking
                  station={modalStation}
                  chargingType={selectedChargingType}
                  vehiclePlate={
                    vehicleName.trim() || EV_PRESETS[vehiclePresetIdx].label
                  }
                  estimatedDurationMinutes={estimatedDurationMinutes}
                  onBack={() => setModalStep("vehicle-registration")}
                  onConfirmed={(confirmation) => {
                    setBookingConfirmation(confirmation);
                    setModalStep("booking-success");
                    drawRoute(modalStation, selectedChargingType);
                  }}
                />
              )}

              {/* Step 4: Booking success */}
              {modalStep === "booking-success" && bookingConfirmation && (
                <BookingSuccess
                  confirmation={bookingConfirmation}
                  onViewMyBookings={() => {
                    setModalStation(null);
                    setMyBookingsOpen(true);
                  }}
                  onBackToMap={() => {
                    setModalStation(null);
                  }}
                />
              )}

              {/* No GPS warning */}
              {locationStatus !== "success" &&
                modalStep !== "booking-success" && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: "10px 14px",
                      background: "#eff6ff",
                      borderRadius: 10,
                      border: "1px solid #bfdbfe",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <RefreshCw size={14} color="#1d4ed8" />
                    <span
                      style={{
                        fontSize: 12,
                        color: "#1d4ed8",
                        fontWeight: 500,
                        fontFamily: "Sora, system-ui, sans-serif",
                      }}
                    >
                      Allow location access to get turn-by-turn directions.
                    </span>
                  </div>
                )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Location status overlay ── */}
      <AnimatePresence>
        {locationStatus === "loading" && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            style={{
              position: "fixed",
              top: 80,
              right: 16,
              background: "#fff",
              borderRadius: 12,
              padding: "8px 14px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
              zIndex: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#6b7280",
              fontFamily: "Sora, system-ui, sans-serif",
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid #1a73e8",
                borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Getting your location…
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

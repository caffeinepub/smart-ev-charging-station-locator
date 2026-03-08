import {
  BatteryCharging,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

// ─── Station name banks (generic, works anywhere in world) ───────────────────
const STATION_NAME_PREFIXES = [
  "ChargeZone",
  "EV Connect",
  "Tata Power EV",
  "Ather Grid",
  "Kazam EV",
  "Volttic EV",
  "HPCL EV",
  "BPCL EV Hub",
  "Magenta Power",
  "SunMobility",
  "Statiq",
  "ZipCharge",
];
const STATION_NAME_SUFFIXES = [
  "Hub",
  "Station",
  "Point",
  "Charging",
  "Fast Charge",
  "Network",
];
const CHARGE_TYPE_POOLS: string[][] = [
  ["Fast Charging", "Slow Charging"],
  ["Fast Charging"],
  ["Slow Charging", "Battery Swapping"],
  ["Fast Charging", "Slow Charging", "Battery Swapping"],
  ["Slow Charging"],
  ["Battery Swapping"],
  ["Fast Charging", "Battery Swapping"],
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Generate 12 realistic stations scattered within ~3 km of user location */
function generateNearbyStations(lat: number, lng: number): UIStation[] {
  const rand = seededRandom(Math.round(lat * 1000 + lng * 1000));
  const stations: UIStation[] = [];

  for (let i = 0; i < 12; i++) {
    // Random offset: 0.2km – 3km radius
    const angle = rand() * 2 * Math.PI;
    const distKm = 0.2 + rand() * 2.8;
    const dLat = (distKm / 111.32) * Math.cos(angle);
    const dLng =
      (distKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);

    const prefix =
      STATION_NAME_PREFIXES[Math.floor(rand() * STATION_NAME_PREFIXES.length)];
    const suffix =
      STATION_NAME_SUFFIXES[Math.floor(rand() * STATION_NAME_SUFFIXES.length)];
    const types =
      CHARGE_TYPE_POOLS[Math.floor(rand() * CHARGE_TYPE_POOLS.length)];
    const isAvailable = rand() > 0.15; // 85% chance open

    stations.push({
      id: String(i + 1),
      name: `${prefix} ${suffix} ${i + 1}`,
      lat: lat + dLat,
      lng: lng + dLng,
      chargingTypes: types,
      isAvailable,
    });
  }

  return stations;
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
type ModalStep = "charging-type" | "vehicle-registration" | "confirmed";

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

  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "success" | "denied" | "unavailable"
  >("loading");
  const [stations, setStations] = useState<UIStation[]>([]);
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
  const [vehiclePresetIdx, setVehiclePresetIdx] = useState(0);
  const [vehicleName, setVehicleName] = useState("");
  const [customCapacity, setCustomCapacity] = useState("");
  const [currentCharge, setCurrentCharge] = useState("20");

  // Confirmation result
  const [chargeTimeEstimate, setChargeTimeEstimate] = useState("");
  const [registrationId, setRegistrationId] = useState("");

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

          // Generate stations near user on first fix
          setStations((prev) => {
            if (prev.length === 0)
              return generateNearbyStations(loc[0], loc[1]);
            return prev;
          });
        },
        (err) => {
          setLocationStatus(
            err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
          );
          // Use demo stations at default center if no GPS
          setStations(
            generateNearbyStations(DEFAULT_CENTER[0], DEFAULT_CENTER[1]),
          );
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
      );
      watchIdRef.current = watchId;
    } else {
      setLocationStatus("unavailable");
      setStations(generateNearbyStations(DEFAULT_CENTER[0], DEFAULT_CENTER[1]));
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
    setVehiclePresetIdx(0);
    setVehicleName("");
    setCustomCapacity("");
    setCurrentCharge("20");
    setChargeTimeEstimate("");
    setRegistrationId("");
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
    const name = vehicleName.trim() || preset.label;

    const vehicle: VehicleInfo = {
      name,
      batteryCapacityKwh: capacityKwh,
      currentChargePercent: chargePercent,
    };

    const estimate = estimateChargeTime(vehicle, selectedChargingType);
    const rid = `EV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    setChargeTimeEstimate(estimate);
    setRegistrationId(rid);
    setModalStep("confirmed");

    // Draw route
    drawRoute(modalStation, selectedChargingType);
  }, [
    modalStation,
    vehiclePresetIdx,
    vehicleName,
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
          {filteredStations.length === 0 && stations.length === 0 && (
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
            }}
          >
            © {year}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1a73e8", textDecoration: "none" }}
            >
              Built with ❤️ using caffeine.ai
            </a>
          </div>
        </div>
      </div>

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
                if (modalStep !== "confirmed") setModalStation(null);
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

              {/* Step 3: Confirmed */}
              {modalStep === "confirmed" && (
                <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#1f2937",
                      fontFamily: "Sora, system-ui, sans-serif",
                      marginBottom: 6,
                    }}
                  >
                    Vehicle Registered!
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      fontFamily: "Sora, system-ui, sans-serif",
                      marginBottom: 20,
                    }}
                  >
                    Booking ID:{" "}
                    <strong style={{ color: "#1a73e8" }}>
                      {registrationId}
                    </strong>
                  </div>

                  {/* Info cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: 12,
                        padding: "12px 10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "#6b7280",
                          fontFamily: "Sora, system-ui, sans-serif",
                          marginBottom: 4,
                        }}
                      >
                        STATION
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#1f2937",
                          fontFamily: "Sora, system-ui, sans-serif",
                        }}
                      >
                        {modalStation.name}
                      </div>
                    </div>
                    <div
                      style={{
                        background: `${CHARGING_CONFIGS[selectedChargingType]?.color ?? "#888"}10`,
                        border: `1px solid ${CHARGING_CONFIGS[selectedChargingType]?.color ?? "#888"}30`,
                        borderRadius: 12,
                        padding: "12px 10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "#6b7280",
                          fontFamily: "Sora, system-ui, sans-serif",
                          marginBottom: 4,
                        }}
                      >
                        CHARGING TYPE
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#1f2937",
                          fontFamily: "Sora, system-ui, sans-serif",
                        }}
                      >
                        {CHARGING_CONFIGS[selectedChargingType]?.icon}{" "}
                        {selectedChargingType}
                      </div>
                    </div>
                  </div>

                  {/* Charge time highlight */}
                  <div
                    style={{
                      background: "#1a73e8",
                      borderRadius: 16,
                      padding: "16px 20px",
                      marginBottom: 20,
                      color: "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.8,
                        fontFamily: "Sora, system-ui, sans-serif",
                        marginBottom: 4,
                      }}
                    >
                      ESTIMATED CHARGING TIME
                    </div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 800,
                        fontFamily: "Sora, system-ui, sans-serif",
                      }}
                    >
                      {chargeTimeEstimate}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.75,
                        fontFamily: "Sora, system-ui, sans-serif",
                        marginTop: 4,
                      }}
                    >
                      to reach 100% charge
                    </div>
                  </div>

                  <button
                    type="button"
                    data-ocid="confirmed.close_button"
                    onClick={() => setModalStation(null)}
                    style={{
                      background: "#f3f4f6",
                      color: "#1f2937",
                      border: "none",
                      borderRadius: 14,
                      padding: "13px",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "Sora, system-ui, sans-serif",
                      width: "100%",
                    }}
                  >
                    View Route on Map
                  </button>
                </div>
              )}

              {/* No GPS warning */}
              {locationStatus !== "success" && modalStep !== "confirmed" && (
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

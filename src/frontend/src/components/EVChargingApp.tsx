import {
  BatteryCharging,
  Calendar,
  ChevronDown,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  Navigation,
  RefreshCw,
  Search,
  Share2,
  User,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
// Leaflet is loaded via CDN in index.html — L is a global
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../leaflet-global.d.ts" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { BookingSuccess } from "./BookingSuccess";
import { MyBookings } from "./MyBookings";
import { type BookingConfirmation, SlotBooking } from "./SlotBooking";

// ─── iOS Design Tokens ────────────────────────────────────────────────────────
const IOS = {
  blue: "#007AFF",
  green: "#34C759",
  red: "#FF3B30",
  orange: "#FF9500",
  yellow: "#FFCC00",
  teal: "#5AC8FA",
  indigo: "#5856D6",
  label: "#1C1C1E",
  secondaryLabel: "#3C3C43",
  tertiaryLabel: "#8E8E93",
  quaternaryLabel: "#C7C7CC",
  systemBackground: "rgba(249, 249, 251, 0.96)",
  groupedBackground: "rgba(242, 242, 247, 0.96)",
  separator: "rgba(60, 60, 67, 0.18)",
  fill: "rgba(120, 120, 128, 0.12)",
  blur: "blur(30px) saturate(1.8)",
  blurLight: "blur(20px) saturate(1.8)",
  blurThin: "blur(10px) saturate(1.4)",
  radius: {
    xs: 6,
    sm: 10,
    md: 13,
    lg: 16,
    xl: 20,
    pill: 9999,
  },
  shadow: {
    control: "0 1px 4px rgba(0,0,0,0.2)",
    sheet: "0 -1px 0 rgba(60,60,67,0.1), 0 -4px 20px rgba(0,0,0,0.08)",
    card: "0 2px 10px rgba(0,0,0,0.08)",
    elevated: "0 4px 16px rgba(0,0,0,0.12)",
  },
  font: {
    largeTitle: { fontSize: 34, fontWeight: 700 },
    title1: { fontSize: 28, fontWeight: 700 },
    title2: { fontSize: 22, fontWeight: 700 },
    title3: { fontSize: 20, fontWeight: 600 },
    headline: { fontSize: 17, fontWeight: 600 },
    body: { fontSize: 17, fontWeight: 400 },
    callout: { fontSize: 16, fontWeight: 400 },
    subheadline: { fontSize: 15, fontWeight: 400 },
    footnote: { fontSize: 13, fontWeight: 400 },
    caption1: { fontSize: 12, fontWeight: 400 },
    caption2: { fontSize: 11, fontWeight: 400 },
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: "#8E8E93",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  primaryButton: {
    background: "#007AFF",
    borderRadius: 12,
    height: 50,
    fontWeight: 600,
    color: "#fff",
    fontSize: 17,
    border: "none",
    cursor: "pointer",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    WebkitTapHighlightColor: "transparent",
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface UIStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  chargingTypes: string[];
  isAvailable: boolean;
  brand?: string;
  distance?: number | null;
}

// ─── Brand detection ──────────────────────────────────────────────────────────
function detectBrand(text: string): string | undefined {
  const t = text.toLowerCase();
  if (
    t.includes("bpcl") ||
    t.includes("bharat petroleum") ||
    t.includes("bharat petro")
  )
    return "bpcl";
  if (t.includes("reliance")) return "reliance";
  if (t.includes("hpcl") || t.includes("hindustan petroleum")) return "hpcl";
  if (t.includes("tata power") || t.includes("tpddl")) return "tata";
  if (t.includes("ather")) return "ather";
  if (t.includes("iocl") || t.includes("indian oil")) return "iocl";
  if (t.includes("charge+zone") || t.includes("chargezone"))
    return "chargezone";
  if (t.includes("statiq")) return "statiq";
  return undefined;
}

const BRAND_CONFIG: Record<
  string,
  { label: string; emoji: string; color: string; bg: string }
> = {
  bpcl: {
    label: "Bharat Petroleum",
    emoji: "🔵",
    color: "#007AFF",
    bg: "rgba(0,122,255,0.1)",
  },
  reliance: {
    label: "Reliance",
    emoji: "🟢",
    color: "#34C759",
    bg: "rgba(52,199,89,0.1)",
  },
  hpcl: {
    label: "HPCL",
    emoji: "🟡",
    color: "#FF9500",
    bg: "rgba(255,149,0,0.1)",
  },
  tata: {
    label: "Tata Power",
    emoji: "⚡",
    color: "#5856D6",
    bg: "rgba(88,86,214,0.1)",
  },
  ather: {
    label: "Ather Grid",
    emoji: "🏎️",
    color: "#5AC8FA",
    bg: "rgba(90,200,250,0.1)",
  },
  iocl: {
    label: "IOCL",
    emoji: "🛢️",
    color: "#FF3B30",
    bg: "rgba(255,59,48,0.1)",
  },
  chargezone: {
    label: "Charge+Zone",
    emoji: "⚡",
    color: "#34C759",
    bg: "rgba(52,199,89,0.1)",
  },
  statiq: {
    label: "Statiq",
    emoji: "⚡",
    color: "#5856D6",
    bg: "rgba(88,86,214,0.1)",
  },
  other: {
    label: "Other",
    emoji: "📍",
    color: "#8E8E93",
    bg: "rgba(142,142,147,0.1)",
  },
};

const BRAND_CHIPS = [
  { key: "all", label: "All", emoji: "⚡" },
  { key: "bpcl", label: "Bharat Petroleum", emoji: "🔵" },
  { key: "reliance", label: "Reliance", emoji: "🟢" },
  { key: "hpcl", label: "HPCL", emoji: "🟡" },
  { key: "tata", label: "Tata Power", emoji: "⚡" },
  { key: "ather", label: "Ather Grid", emoji: "🏎️" },
  { key: "iocl", label: "IOCL", emoji: "🛢️" },
  { key: "chargezone", label: "Charge+Zone", emoji: "⚡" },
  { key: "statiq", label: "Statiq", emoji: "⚡" },
  { key: "other", label: "Other", emoji: "📍" },
];

interface VehicleInfo {
  name: string;
  batteryCapacityKwh: number;
  currentChargePercent: number;
}

const CHARGING_POWER_KW: Record<string, number> = {
  "Fast Charging": 50,
  "Slow Charging": 7.4,
  "Battery Swapping": 0,
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

// ─── Station fetching ─────────────────────────────────────────────────────────
const KNOWN_SEED_STATIONS: UIStation[] = [
  {
    id: "known-ather-bailhongal",
    name: "Ather Grid Charging Station",
    lat: 15.9795,
    lng: 74.8573,
    chargingTypes: ["Fast Charging", "Slow Charging"],
    isAvailable: true,
    brand: "ather",
  },
  {
    id: "known-tatapower-belagavi",
    name: "Tata Power EV Charging – Belagavi",
    lat: 15.8497,
    lng: 74.4977,
    chargingTypes: ["Fast Charging", "Slow Charging"],
    isAvailable: true,
    brand: "tatapower",
  },
  {
    id: "known-bpcl-saundatti",
    name: "Bharat Petroleum EV Point – Saundatti",
    lat: 15.77,
    lng: 75.117,
    chargingTypes: ["Slow Charging"],
    isAvailable: true,
    brand: "bpcl",
  },
  {
    id: "known-ather-gokak",
    name: "Ather Grid – Gokak",
    lat: 16.168,
    lng: 74.822,
    chargingTypes: ["Fast Charging"],
    isAvailable: true,
    brand: "ather",
  },
  {
    id: "known-reliance-ramdurg",
    name: "Reliance BP EV Station – Ramdurg",
    lat: 15.96,
    lng: 75.28,
    chargingTypes: ["Fast Charging", "Slow Charging"],
    isAvailable: true,
    brand: "reliance",
  },
  {
    id: "known-iocl-kittur",
    name: "IndianOil EV Point – Kittur",
    lat: 15.73,
    lng: 74.99,
    chargingTypes: ["Slow Charging"],
    isAvailable: true,
    brand: "iocl",
  },
  {
    id: "known-hpcl-nandagad",
    name: "HP Petrol Pump EV Charger – Nandagad",
    lat: 16.02,
    lng: 74.72,
    chargingTypes: ["Slow Charging"],
    isAvailable: true,
    brand: "hpcl",
  },
  {
    id: "known-statiq-belgaum-nh",
    name: "Statiq EV Station – NH748 Belgaum",
    lat: 15.91,
    lng: 74.595,
    chargingTypes: ["Fast Charging"],
    isAvailable: true,
    brand: "statiq",
  },
  {
    id: "known-chargeplus-bailhongal",
    name: "Charge+Zone – Bailhongal Road",
    lat: 16.005,
    lng: 74.885,
    chargingTypes: ["Fast Charging", "Battery Swapping"],
    isAvailable: true,
    brand: "chargeplus",
  },
  {
    id: "known-tatapower-sampgaon",
    name: "Tata Power Charging Hub – Sampgaon",
    lat: 15.81,
    lng: 74.75,
    chargingTypes: ["Fast Charging", "Slow Charging"],
    isAvailable: true,
    brand: "tatapower",
  },
  {
    id: "known-ather-athani",
    name: "Ather Grid – Athani",
    lat: 16.727,
    lng: 75.064,
    chargingTypes: ["Fast Charging"],
    isAvailable: false,
    brand: "ather",
  },
  {
    id: "known-bpcl-khanapur",
    name: "Bharat Petroleum EV – Khanapur",
    lat: 15.638,
    lng: 74.502,
    chargingTypes: ["Slow Charging", "Battery Swapping"],
    isAvailable: true,
    brand: "bpcl",
  },
  {
    id: "known-tatapower-bailhongal-north",
    name: "Tata Power EV Hub – Bailhongal North",
    lat: 16.025,
    lng: 74.857,
    chargingTypes: ["Fast Charging", "Slow Charging"],
    isAvailable: true,
    brand: "tatapower",
  },
  {
    id: "known-statiq-bailhongal-east",
    name: "Statiq Charging Point – Bailhongal East",
    lat: 15.976,
    lng: 74.933,
    chargingTypes: ["Fast Charging"],
    isAvailable: true,
    brand: "statiq",
  },
  {
    id: "known-hpcl-bailhongal-south",
    name: "HP EV Charger – Bailhongal South",
    lat: 15.892,
    lng: 74.862,
    chargingTypes: ["Slow Charging"],
    isAvailable: true,
    brand: "hpcl",
  },
  {
    id: "known-reliance-bailhongal-west",
    name: "Reliance EV Station – Bailhongal West",
    lat: 15.979,
    lng: 74.793,
    chargingTypes: ["Fast Charging", "Battery Swapping"],
    isAvailable: true,
    brand: "reliance",
  },
  {
    id: "known-iocl-bailhongal-ne",
    name: "IndianOil EV Point – Ugarkhod Road",
    lat: 16.052,
    lng: 74.951,
    chargingTypes: ["Slow Charging", "Fast Charging"],
    isAvailable: true,
    brand: "iocl",
  },
  {
    id: "known-chargeplus-bailhongal-sw",
    name: "Charge+Zone – Saundatti Road",
    lat: 15.848,
    lng: 74.745,
    chargingTypes: ["Fast Charging", "Battery Swapping"],
    isAvailable: true,
    brand: "chargeplus",
  },
];

interface OCMItem {
  ID: number;
  AddressInfo: {
    Title: string;
    Latitude: number;
    Longitude: number;
    Town?: string;
    StateOrProvince?: string;
  };
  StatusType?: { IsOperational?: boolean };
  Connections?: Array<{
    ConnectionType?: { FormalName?: string; Title?: string };
    LevelID?: number;
    PowerKW?: number;
  }>;
  OperatorInfo?: { Title?: string };
}

function ocmItemToStation(item: OCMItem, idx: number): UIStation | null {
  if (!item.AddressInfo?.Latitude || !item.AddressInfo?.Longitude) return null;
  const types = new Set<string>();
  for (const conn of item.Connections ?? []) {
    const connName = (
      conn.ConnectionType?.FormalName ??
      conn.ConnectionType?.Title ??
      ""
    ).toLowerCase();
    const level = conn.LevelID ?? 0;
    const kw = conn.PowerKW ?? 0;
    if (
      connName.includes("chademo") ||
      connName.includes("ccs") ||
      connName.includes("combo") ||
      connName.includes("dc") ||
      level === 3 ||
      kw >= 22
    ) {
      types.add("Fast Charging");
    } else {
      types.add("Slow Charging");
    }
  }
  if (types.size === 0) types.add("Slow Charging");
  const operatorTitle = item.OperatorInfo?.Title ?? "";
  const brandStr = `${item.AddressInfo.Title} ${operatorTitle}`;
  return {
    id: `ocm-${item.ID ?? idx}`,
    name: item.AddressInfo.Title ?? `EV Station ${idx + 1}`,
    lat: item.AddressInfo.Latitude,
    lng: item.AddressInfo.Longitude,
    chargingTypes: Array.from(types),
    isAvailable: item.StatusType?.IsOperational !== false,
    brand: detectBrand(brandStr),
  };
}

function buildOverpassQuery(lat: number, lng: number, radiusM: number) {
  return `[out:json][timeout:30];
(
  node["amenity"="charging_station"](around:${radiusM},${lat},${lng});
  way["amenity"="charging_station"](around:${radiusM},${lat},${lng});
  relation["amenity"="charging_station"](around:${radiusM},${lat},${lng});
  node["ev_charging"="yes"](around:${radiusM},${lat},${lng});
  node["amenity"="fuel"]["ev_charging"="yes"](around:${radiusM},${lat},${lng});
  way["amenity"="fuel"]["ev_charging"="yes"](around:${radiusM},${lat},${lng});
);
out body center 40;`;
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

function deduplicateByProximity(
  stations: UIStation[],
  thresholdKm = 0.05,
): UIStation[] {
  const result: UIStation[] = [];
  for (const station of stations) {
    const isDuplicate = result.some(
      (existing) =>
        haversineDistance(
          existing.lat,
          existing.lng,
          station.lat,
          station.lng,
        ) < thresholdKm,
    );
    if (!isDuplicate) result.push(station);
  }
  return result;
}

async function fetchFromOCM(lat: number, lng: number): Promise<UIStation[]> {
  const url = new URL("https://api.openchargemap.io/v3/poi/");
  url.searchParams.set("output", "json");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("distance", "50");
  url.searchParams.set("distanceunit", "km");
  url.searchParams.set("maxresults", "50");
  url.searchParams.set("compact", "false");
  url.searchParams.set("verbose", "false");
  url.searchParams.set("key", "");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];
  const data: OCMItem[] = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((item, idx) => ocmItemToStation(item, idx))
    .filter((s): s is UIStation => s !== null);
}

async function fetchFromOverpassProxy(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<UIStation[]> {
  const query = buildOverpassQuery(lat, lng, radiusM);
  const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(overpassUrl)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) return [];
  const wrapper = await res.json();
  if (!wrapper?.contents) return [];
  let data: {
    elements?: Array<{
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };
  try {
    data = JSON.parse(wrapper.contents);
  } catch {
    return [];
  }
  const elements = data?.elements ?? [];
  return elements
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
      const brandStr = `${name} ${tags.operator ?? ""} ${tags.brand ?? ""}`;
      return {
        id: `osm-${el.id}`,
        name,
        lat: elLat,
        lng: elLng,
        chargingTypes: overpassTagsToChargingTypes(tags),
        isAvailable:
          tags.operational_status !== "closed" && tags.access !== "no",
        brand: detectBrand(brandStr),
      } as UIStation;
    })
    .filter((s): s is UIStation => s !== null);
}

const NOMINATIM_BRANDS = [
  "BPCL EV charging",
  "Ather Grid charging station",
  "Tata Power EV charging",
  "HPCL EV charging",
  "Reliance EV charging",
  "IOCL EV charging",
  "Statiq charging station",
  "Charge+Zone",
];

async function fetchFromNominatim(
  lat: number,
  lng: number,
): Promise<UIStation[]> {
  const results: UIStation[] = [];
  const viewbox = `${lng - 0.5},${lat + 0.5},${lng + 0.5},${lat - 0.5}`;
  await Promise.allSettled(
    NOMINATIM_BRANDS.map(async (brand) => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(brand)}&format=json&limit=3&bounded=1&viewbox=${encodeURIComponent(viewbox)}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: { "Accept-Language": "en" },
        });
        if (!res.ok) return;
        const items: Array<{
          place_id: number;
          display_name: string;
          lat: string;
          lon: string;
        }> = await res.json();
        for (const item of items) {
          const itemLat = Number.parseFloat(item.lat);
          const itemLng = Number.parseFloat(item.lon);
          if (Number.isNaN(itemLat) || Number.isNaN(itemLng)) continue;
          results.push({
            id: `nom-${item.place_id}`,
            name: item.display_name.split(",")[0] || brand,
            lat: itemLat,
            lng: itemLng,
            chargingTypes: ["Fast Charging", "Slow Charging"],
            isAvailable: true,
            brand: detectBrand(`${item.display_name} ${brand}`),
          });
        }
      } catch {
        // ignore
      }
    }),
  );
  return results;
}

async function fetchRealStations(
  lat: number,
  lng: number,
  onStatus?: (msg: string) => void,
): Promise<UIStation[]> {
  onStatus?.("Checking Open Charge Map...");
  const [ocmResult, overpassResult] = await Promise.allSettled([
    fetchFromOCM(lat, lng),
    fetchFromOverpassProxy(lat, lng, 25000),
  ]);
  onStatus?.("Also checking OpenStreetMap...");
  const ocmStations = ocmResult.status === "fulfilled" ? ocmResult.value : [];
  const overpassStations =
    overpassResult.status === "fulfilled" ? overpassResult.value : [];
  let combined = deduplicateByProximity([...ocmStations, ...overpassStations]);
  if (combined.length < 2) {
    onStatus?.("Searching by brand name...");
    try {
      const nomStations = await fetchFromNominatim(lat, lng);
      combined = deduplicateByProximity([...combined, ...nomStations]);
    } catch {
      // continue
    }
  }
  const count = combined.length;
  onStatus?.(
    count > 0
      ? `Found ${count} station${count !== 1 ? "s" : ""}!`
      : "No stations found nearby",
  );
  const seedsToAdd = KNOWN_SEED_STATIONS.filter(
    (seed) =>
      !combined.some(
        (fetched) =>
          haversineDistance(seed.lat, seed.lng, fetched.lat, fetched.lng) < 0.1,
      ),
  );
  return [...combined, ...seedsToAdd];
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

// ─── iOS-style teardrop marker ────────────────────────────────────────────────
function createStationIcon(isAvailable: boolean, isSelected: boolean) {
  const pinColor = isSelected ? IOS.blue : isAvailable ? IOS.green : IOS.red;
  const strokeColor = isSelected
    ? "#005FCC"
    : isAvailable
      ? "#248A3D"
      : "#CC2B25";
  const w = isSelected ? 40 : 30;
  const h = isSelected ? 54 : 40;

  const iconPath = isAvailable
    ? `<path d="M13 3L6 13h6l-1 8 7-10h-6l1-8z" fill="${pinColor}" stroke="white" stroke-width="0.8" stroke-linejoin="round"/>`
    : `<path d="M8 8l8 8M16 8l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>`;

  const svgHtml = `
    <div style="
      position:relative;
      width:${w}px;
      height:${h}px;
      filter:drop-shadow(0 2px 5px rgba(0,0,0,0.3));
      transition:filter 0.15s ease, transform 0.15s ease;
    ">
      <svg
        viewBox="0 0 32 48"
        width="${w}"
        height="${h}"
        xmlns="http://www.w3.org/2000/svg"
        overflow="visible"
      >
        <path
          d="M16 1C8.268 1 2 7.268 2 15c0 10.627 14 31 14 31S30 25.627 30 15C30 7.268 23.732 1 16 1z"
          fill="${pinColor}"
          stroke="${strokeColor}"
          stroke-width="${isSelected ? 1.5 : 1}"
        />
        <circle cx="16" cy="15" r="${isSelected ? 8.5 : 7.5}" fill="white"/>
        <g transform="translate(${isSelected ? 4 : 4}, ${isSelected ? 3 : 3}) scale(${isSelected ? 1.0 : 0.875})">
          ${iconPath}
        </g>
      </svg>
    </div>`;

  return L.divIcon({
    html: svgHtml,
    className: "",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -(h + 4)],
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
    iconSize: [22, 22],
    iconAnchor: [11, 11],
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
    color: IOS.orange,
    ocid: "charging.fast_button",
  },
  "Slow Charging": {
    icon: "🔋",
    description: "AC slow charge — 7.4 kW",
    color: IOS.green,
    ocid: "charging.slow_button",
  },
  "Battery Swapping": {
    icon: "🔄",
    description: "Swap battery in ~5 min",
    color: IOS.blue,
    ocid: "charging.swap_button",
  },
};

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

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;

type ModalStep =
  | "charging-type"
  | "vehicle-registration"
  | "slot-booking"
  | "booking-success";

const MAP_TILES = {
  standard: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ─── iOS Station Info Card ────────────────────────────────────────────────────
interface StationInfoCardProps {
  station: UIStation & { distance?: number | null };
  onClose: () => void;
  onBookSlot: () => void;
  onNavigate: () => void;
}

function StationInfoCard({
  station,
  onClose,
  onBookSlot,
  onNavigate,
}: StationInfoCardProps) {
  const brandCfg = station.brand ? BRAND_CONFIG[station.brand] : null;
  const distStr =
    station.distance != null
      ? station.distance < 1
        ? `${Math.round(station.distance * 1000)} m`
        : `${station.distance.toFixed(1)} km`
      : null;

  const handleShare = () => {
    const url = `https://www.openstreetmap.org/?mlat=${station.lat}&mlon=${station.lng}&zoom=16`;
    if (navigator.share) {
      void navigator.share({ title: station.name, url });
    } else {
      void navigator.clipboard.writeText(url);
      toast.success("Location link copied!");
    }
  };

  return (
    <motion.div
      data-ocid="station.card"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{
        type: "spring",
        damping: 40,
        stiffness: 380,
        mass: 1,
      }}
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 450,
        background: IOS.groupedBackground,
        backdropFilter: IOS.blur,
        WebkitBackdropFilter: IOS.blur,
        borderRadius: `${IOS.radius.md}px ${IOS.radius.md}px 0 0`,
        boxShadow: IOS.shadow.sheet,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Sora", system-ui, sans-serif',
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)",
      }}
    >
      {/* iOS drag handle */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: 10,
          paddingBottom: 6,
        }}
      >
        <div
          style={{
            width: 36,
            height: 5,
            borderRadius: 2.5,
            background: "rgba(60,60,67,0.3)",
          }}
        />
      </div>

      {/* Station info */}
      <div
        style={{
          padding: "6px 16px 10px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        {/* iOS-style icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: IOS.radius.md,
            background: station.isAvailable
              ? "rgba(52,199,89,0.12)"
              : "rgba(255,59,48,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            role="img"
            aria-label="EV charging"
          >
            <title>EV charging</title>
            <path
              d="M13 3L6 13h6l-1 8 7-10h-6l1-8z"
              fill={station.isAvailable ? IOS.green : IOS.red}
              stroke={station.isAvailable ? "#248A3D" : "#CC2B25"}
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...IOS.font.headline,
              color: IOS.label,
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {station.name}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexWrap: "wrap",
              marginBottom: 6,
            }}
          >
            {brandCfg && (
              <span
                style={{
                  ...IOS.font.caption2,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: IOS.radius.pill,
                  background: brandCfg.bg,
                  color: brandCfg.color,
                }}
              >
                {brandCfg.emoji} {brandCfg.label}
              </span>
            )}
            {distStr && (
              <span
                style={{
                  ...IOS.font.caption1,
                  color: IOS.tertiaryLabel,
                }}
              >
                · {distStr}
              </span>
            )}
            <span
              style={{
                ...IOS.font.caption1,
                fontWeight: 600,
                color: station.isAvailable ? IOS.green : IOS.red,
              }}
            >
              · {station.isAvailable ? "Open" : "Unavailable"}
            </span>
          </div>

          {/* Charging type labels — iOS style */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {station.chargingTypes.map((type) => {
              const cfg = CHARGING_CONFIGS[type];
              return cfg ? (
                <span
                  key={type}
                  style={{
                    ...IOS.font.caption2,
                    fontWeight: 500,
                    padding: "3px 8px",
                    borderRadius: IOS.radius.sm,
                    background: IOS.fill,
                    color: IOS.secondaryLabel,
                  }}
                >
                  {cfg.icon} {type}
                </span>
              ) : null;
            })}
          </div>
        </div>

        {/* Close button — iOS style */}
        <button
          type="button"
          data-ocid="station.close_button"
          onClick={onClose}
          style={{
            background: IOS.fill,
            border: "none",
            borderRadius: "50%",
            width: 30,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: IOS.tertiaryLabel,
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* iOS hairline separator */}
      <div
        style={{
          height: "0.5px",
          background: IOS.separator,
          margin: "0 16px 12px",
        }}
      />

      {/* Action buttons — iOS circular icon row */}
      <div
        style={{
          padding: "0 16px 4px",
          display: "flex",
          gap: 12,
          justifyContent: "center",
        }}
      >
        {/* Navigate — filled blue circle */}
        <button
          type="button"
          data-ocid="station.navigate_button"
          onClick={onNavigate}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: IOS.blue,
            color: "#fff",
            border: "none",
            borderRadius: IOS.radius.pill,
            padding: "13px 0",
            ...IOS.font.subheadline,
            fontWeight: 600,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Navigation size={14} />
          Navigate
        </button>

        {/* Book Slot */}
        <button
          type="button"
          data-ocid="station.book_button"
          onClick={onBookSlot}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "rgba(0,122,255,0.1)",
            color: IOS.blue,
            border: "none",
            borderRadius: IOS.radius.pill,
            padding: "13px 0",
            ...IOS.font.subheadline,
            fontWeight: 600,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Zap size={14} />
          Book Slot
        </button>

        {/* Share — circular */}
        <button
          type="button"
          data-ocid="station.share_button"
          onClick={handleShare}
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: IOS.fill,
            color: IOS.blue,
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Share2 size={15} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── iOS Navigation Bar (active route) ───────────────────────────────────────
interface NavBarProps {
  stationName: string;
  distance: string;
  onEnd: () => void;
}

function NavigationBar({ stationName, distance, onEnd }: NavBarProps) {
  return (
    <motion.div
      data-ocid="navigation.panel"
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -70, opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 600,
        background: "rgba(0,122,255,0.96)",
        backdropFilter: IOS.blur,
        WebkitBackdropFilter: IOS.blur,
        padding: "12px 16px",
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Sora", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Navigation size={16} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "rgba(255,255,255,0.75)",
            ...IOS.font.caption2,
            marginBottom: 1,
          }}
        >
          Your Location → {stationName}
        </div>
        <div
          style={{
            color: "#fff",
            ...IOS.font.subheadline,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {distance}
        </div>
      </div>
      <button
        type="button"
        data-ocid="route.cancel_button"
        onClick={onEnd}
        style={{
          background: "#fff",
          color: IOS.blue,
          border: "none",
          borderRadius: IOS.radius.sm,
          padding: "7px 16px",
          ...IOS.font.footnote,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        END
      </button>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function EVChargingApp() {
  const { identity, login, clear, isLoggingIn, isInitializing } =
    useInternetIdentity();
  const isLoggedIn = !!identity;

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routingControlRef = useRef<L.Routing.Control | null>(null);
  const stationMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const stationListRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const stationsFetchedRef = useRef(false);
  const lastFetchLocRef = useRef<[number, number] | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "success" | "denied" | "unavailable"
  >("loading");
  const [stations, setStations] = useState<UIStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [stationsFetchError, setStationsFetchError] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(
    "Fetching real nearby EV stations...",
  );
  const [selectedStation, setSelectedStation] = useState<UIStation | null>(
    null,
  );
  const [hasRoute, setHasRoute] = useState(false);
  const [routeDistance, setRouteDistance] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">(
    "standard",
  );

  // Modal flow
  const [modalStation, setModalStation] = useState<UIStation | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>("charging-type");
  const [selectedChargingType, setSelectedChargingType] = useState<string>("");

  // Vehicle registration
  const [autoFilledFromProfile, setAutoFilledFromProfile] = useState(false);
  const [vehicleType, setVehicleType] = useState<"bike" | "car" | "other">(
    "car",
  );
  const [vehiclePresetIdx, setVehiclePresetIdx] = useState(0);
  const [vehicleName, setVehicleName] = useState("");
  const [customCapacity, setCustomCapacity] = useState("");
  const [currentCharge, setCurrentCharge] = useState("20");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(30);

  // Booking
  const [bookingConfirmation, setBookingConfirmation] =
    useState<BookingConfirmation | null>(null);
  const [myBookingsOpen, setMyBookingsOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [loginBannerDismissed, setLoginBannerDismissed] = useState(false);

  // Profile menu & details
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [profileName, setProfileName] = useState(
    () => localStorage.getItem("ev_profile_name") || "",
  );
  const [profilePhone, setProfilePhone] = useState(
    () => localStorage.getItem("ev_profile_phone") || "",
  );
  const [profileVehicleType, setProfileVehicleType] = useState(
    () => localStorage.getItem("ev_profile_vehicleType") || "car",
  );
  const [profileVehicleModel, setProfileVehicleModel] = useState(
    () => localStorage.getItem("ev_profile_vehicleModel") || "",
  );
  const [profilePlate, setProfilePlate] = useState(
    () => localStorage.getItem("ev_profile_plate") || "",
  );
  const [profileCapacity, setProfileCapacity] = useState(
    () => localStorage.getItem("ev_profile_capacity") || "",
  );
  const [profileEditing, setProfileEditing] = useState(false);

  useEffect(() => {
    if (isLoggedIn) setLoginBannerDismissed(true);
  }, [isLoggedIn]);

  const stationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stations) map.set(s.id, s.name);
    return map;
  }, [stations]);

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

  const filteredStations = sortedStations.filter((s) => {
    const matchesSearch =
      searchQuery === "" ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBrand =
      !activeBrand || activeBrand === "all"
        ? true
        : activeBrand === "other"
          ? !s.brand || s.brand === "other"
          : s.brand === activeBrand;
    return matchesSearch && matchesBrand;
  });

  const selectedStationWithDist = useMemo(() => {
    if (!selectedStation) return null;
    return sortedStations.find((s) => s.id === selectedStation.id) ?? null;
  }, [selectedStation, sortedStations]);

  // ─── Load stations ───────────────────────────────────────────────────────────
  const loadStations = useCallback((loc: [number, number]) => {
    setStations(KNOWN_SEED_STATIONS);
    setSheetExpanded(true);
    setStationsLoading(true);
    setStationsFetchError(false);
    setFetchStatus("Checking Open Charge Map...");
    stationsFetchedRef.current = true;
    lastFetchLocRef.current = loc;
    fetchRealStations(loc[0], loc[1], setFetchStatus).then((real) => {
      setStationsLoading(false);
      if (real.length > 0) {
        setStations(real);
        setSheetExpanded(true);
        if (mapRef.current) {
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
            mapRef.current.fitBounds(
              L.latLngBounds(
                L.latLng(minLat - 0.005, minLng - 0.005),
                L.latLng(maxLat + 0.005, maxLng + 0.005),
              ),
              { padding: [80, 80] },
            );
          }
        }
      } else {
        setStations(KNOWN_SEED_STATIONS);
        setSheetExpanded(true);
      }
    });
  }, []);

  // ─── Map init ───────────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: map init runs once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
    });

    const tileOptions = {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
      maxNativeZoom: 19,
      keepBuffer: 6,
      subdomains: "abc",
      detectRetina: false,
      crossOrigin: true,
    } as L.TileLayerOptions;
    const tile = L.tileLayer(MAP_TILES.standard, tileOptions).addTo(map);

    tileLayerRef.current = tile;
    mapRef.current = map;

    setTimeout(() => map.invalidateSize({ animate: false }), 100);
    setTimeout(() => map.invalidateSize({ animate: false }), 500);

    map.on("click", () => {
      setSelectedStation(null);
    });

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
            map.flyTo(loc, 18, { duration: 1.5 });
          }
          if (!stationsFetchedRef.current) loadStations(loc);
        },
        (err) => {
          setLocationStatus(
            err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
          );
          if (!stationsFetchedRef.current) loadStations(DEFAULT_CENTER);
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

  // ─── Satellite toggle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(
      mapStyle === "satellite" ? MAP_TILES.satellite : MAP_TILES.standard,
    );
  }, [mapStyle]);

  // ─── Sync station markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || stations.length === 0) return;
    const map = mapRef.current;
    for (const marker of stationMarkersRef.current.values()) marker.remove();
    stationMarkersRef.current.clear();

    for (const station of stations) {
      const marker = L.marker([station.lat, station.lng], {
        icon: createStationIcon(station.isAvailable, false),
      }).addTo(map);

      marker.on("click", () => {
        setSelectedStation(station);
        setSheetExpanded(false);
        map.flyTo([station.lat, station.lng], Math.max(map.getZoom(), 14), {
          duration: 0.8,
        });
      });

      stationMarkersRef.current.set(station.id, marker);
    }
  }, [stations]);

  // ─── Update marker icons on selection ───────────────────────────────────────
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
    setAutoFilledFromProfile(false);
    setCurrentCharge("20");
    setBookingConfirmation(null);
  }, []);

  const handleChargingTypeSelect = useCallback((type: string) => {
    setSelectedChargingType(type);
    // Auto-fill vehicle registration from saved profile
    const savedVehicleType = localStorage.getItem("ev_profile_vehicleType");
    const savedVehicleModel = localStorage.getItem("ev_profile_vehicleModel");
    const savedCapacity = localStorage.getItem("ev_profile_capacity");
    if (
      savedVehicleType === "bike" ||
      savedVehicleType === "car" ||
      savedVehicleType === "other"
    ) {
      setVehicleType(savedVehicleType);
    }
    if (savedVehicleModel) setVehicleName(savedVehicleModel);
    if (savedCapacity) setCustomCapacity(savedCapacity);
    if (savedVehicleModel || savedCapacity) setAutoFilledFromProfile(true);
    else setAutoFilledFromProfile(false);
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
    let durationMins = 30;
    if (selectedChargingType === "Battery Swapping") {
      durationMins = 5;
    } else {
      const powerKw = selectedChargingType === "Fast Charging" ? 50 : 7.4;
      const neededKwh = capacityKwh * ((100 - chargePercent) / 100);
      durationMins = Math.max(5, Math.round((neededKwh / powerKw) * 60));
    }
    setEstimatedDurationMinutes(durationMins);
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
      const distKm = haversineDistance(
        userLocation[0],
        userLocation[1],
        station.lat,
        station.lng,
      );
      const etaMins = Math.round((distKm / 40) * 60);
      setRouteDistance(`${etaMins} min · ${distKm.toFixed(1)} km`);

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
            { color: IOS.blue, weight: 5, opacity: 0.9 },
            { color: IOS.teal, weight: 3, opacity: 0.45 },
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
        { duration: 1.0 },
      );
    }
  }, [userLocation]);

  const handleLocateMe = useCallback(() => {
    if (mapRef.current && userLocation) {
      mapRef.current.flyTo(userLocation, 16, { duration: 1.2 });
    } else {
      toast.info("Waiting for GPS signal...");
    }
  }, [userLocation]);

  const handleSelectStation = useCallback((station: UIStation) => {
    setSelectedStation(station);
    setSheetExpanded(false);
    if (mapRef.current) {
      mapRef.current.flyTo(
        [station.lat, station.lng],
        Math.max(mapRef.current.getZoom(), 14),
        { duration: 1.0 },
      );
    }
  }, []);

  const year = new Date().getFullYear();
  const selectedPreset = EV_PRESETS[vehiclePresetIdx];
  const showInfoCard = selectedStation !== null && modalStation === null;

  const iosInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 16px",
    borderRadius: IOS.radius.sm,
    border: "none",
    ...IOS.font.callout,
    color: IOS.label,
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    WebkitTapHighlightColor: "transparent",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Sora", system-ui, sans-serif',
  };

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
      {/* ── Full-screen map ── */}
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

      {/* ── Navigation Bar (active route) ── */}
      <AnimatePresence>
        {hasRoute && (
          <NavigationBar
            stationName={selectedStation?.name ?? "Destination"}
            distance={routeDistance}
            onEnd={handleClearRoute}
          />
        )}
      </AnimatePresence>

      {/* ── Profile Icon (top-left) ── */}
      <div
        ref={profileMenuRef}
        style={{
          position: "fixed",
          top: "max(env(safe-area-inset-top, 44px), 44px)",
          left: 12,
          zIndex: 510,
        }}
      >
        <button
          type="button"
          data-ocid="profile.button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isLoggedIn) {
              login();
              return;
            }
            setProfileMenuOpen((prev) => !prev);
          }}
          title={isLoggedIn ? "Your profile" : "Sign in to book"}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: isLoggedIn ? IOS.blue : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: isLoggedIn ? "none" : "0.5px solid rgba(0,0,0,0.1)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: isLoggedIn ? "#fff" : IOS.tertiaryLabel,
            WebkitTapHighlightColor: "transparent",
            transition: "background 0.2s, transform 0.1s",
          }}
        >
          {isLoggingIn ? (
            <Loader2
              size={18}
              style={{ animation: "spin 0.8s linear infinite" }}
            />
          ) : isLoggedIn ? (
            <User size={18} />
          ) : (
            <LogIn size={18} />
          )}
        </button>

        {/* Profile dropdown menu */}
        {profileMenuOpen && isLoggedIn && (
          <>
            {/* Backdrop */}
            <div
              style={{ position: "fixed", inset: 0, zIndex: 598 }}
              onPointerDown={(e) => {
                e.preventDefault();
                setProfileMenuOpen(false);
              }}
            />
            {/* Menu card */}
            <div
              data-ocid="profile.dropdown_menu"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                zIndex: 599,
                background: "rgba(255,255,255,0.96)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderRadius: 14,
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
                overflow: "hidden",
                minWidth: 220,
                border: "0.5px solid rgba(0,0,0,0.08)",
              }}
            >
              {/* Profile Details */}
              <button
                type="button"
                data-ocid="profile.edit_button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProfileMenuOpen(false);
                  setProfileDetailsOpen(true);
                }}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(0,122,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: IOS.blue,
                    flexShrink: 0,
                  }}
                >
                  <User size={16} />
                </div>
                <div>
                  <div
                    style={{
                      ...IOS.font.body,
                      color: IOS.label,
                      fontWeight: 500,
                    }}
                  >
                    Profile Details
                  </div>
                  <div
                    style={{
                      ...IOS.font.caption1,
                      color: IOS.tertiaryLabel,
                      marginTop: 1,
                    }}
                  >
                    {profileName || "Add your details"}
                  </div>
                </div>
              </button>
              {/* Separator */}
              <div
                style={{
                  height: 0.5,
                  background: IOS.separator,
                  marginLeft: 60,
                }}
              />
              {/* View My Bookings */}
              <button
                type="button"
                data-ocid="profile.open_modal_button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProfileMenuOpen(false);
                  setMyBookingsOpen(true);
                }}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(52,199,89,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#34C759",
                    flexShrink: 0,
                  }}
                >
                  <Calendar size={16} />
                </div>
                <div>
                  <div
                    style={{
                      ...IOS.font.body,
                      color: IOS.label,
                      fontWeight: 500,
                    }}
                  >
                    View My Bookings
                  </div>
                  <div
                    style={{
                      ...IOS.font.caption1,
                      color: IOS.tertiaryLabel,
                      marginTop: 1,
                    }}
                  >
                    Booking history
                  </div>
                </div>
              </button>
              {/* Separator */}
              <div
                style={{
                  height: 0.5,
                  background: IOS.separator,
                  marginLeft: 60,
                }}
              />
              {/* Logout */}
              <button
                type="button"
                data-ocid="profile.delete_button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProfileMenuOpen(false);
                  clear();
                }}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(255,59,48,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FF3B30",
                    flexShrink: 0,
                  }}
                >
                  <LogOut size={16} />
                </div>
                <div
                  style={{
                    ...IOS.font.body,
                    color: "#FF3B30",
                    fontWeight: 500,
                  }}
                >
                  Logout
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Profile Details Modal ── */}
      <AnimatePresence>
        {profileDetailsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 820,
              }}
              onClick={() => {
                setProfileDetailsOpen(false);
                setProfileEditing(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              data-ocid="profile.modal"
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 830,
                background: "rgba(242,242,247,0.98)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                borderRadius: "20px 20px 0 0",
                padding: "0 0 max(env(safe-area-inset-bottom, 20px), 20px) 0",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 16px 8px",
                }}
              >
                <div
                  style={{
                    ...IOS.font.title3,
                    color: IOS.label,
                    fontWeight: 700,
                  }}
                >
                  Profile
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!profileEditing ? (
                    <button
                      type="button"
                      data-ocid="profile.edit_button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setProfileEditing(true);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        ...IOS.font.body,
                        color: IOS.blue,
                        fontWeight: 500,
                      }}
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-ocid="profile.save_button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        localStorage.setItem("ev_profile_name", profileName);
                        localStorage.setItem("ev_profile_phone", profilePhone);
                        localStorage.setItem(
                          "ev_profile_vehicleType",
                          profileVehicleType,
                        );
                        localStorage.setItem(
                          "ev_profile_vehicleModel",
                          profileVehicleModel,
                        );
                        localStorage.setItem("ev_profile_plate", profilePlate);
                        localStorage.setItem(
                          "ev_profile_capacity",
                          profileCapacity,
                        );
                        setProfileEditing(false);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        ...IOS.font.body,
                        color: IOS.blue,
                        fontWeight: 600,
                      }}
                    >
                      Save
                    </button>
                  )}
                  <button
                    type="button"
                    data-ocid="profile.close_button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setProfileDetailsOpen(false);
                      setProfileEditing(false);
                    }}
                    style={{
                      background: "rgba(120,120,128,0.16)",
                      border: "none",
                      cursor: "pointer",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: IOS.secondaryLabel,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Avatar */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "12px 16px 20px",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: IOS.blue,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    marginBottom: 8,
                  }}
                >
                  <User size={32} />
                </div>
                <div
                  style={{
                    ...IOS.font.headline,
                    color: IOS.label,
                    fontWeight: 600,
                  }}
                >
                  {profileName || "EV Driver"}
                </div>
                <div style={{ ...IOS.font.caption1, color: IOS.tertiaryLabel }}>
                  {`${identity?.getPrincipal().toString().slice(0, 20)}...`}
                </div>
              </div>

              {/* Form */}
              <div
                style={{
                  padding: "0 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Personal Info */}
                <div
                  style={{
                    ...IOS.font.footnote,
                    color: IOS.tertiaryLabel,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    paddingLeft: 4,
                    marginBottom: 4,
                  }}
                >
                  Personal Info
                </div>
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {[
                    {
                      label: "Full Name",
                      value: profileName,
                      onChange: setProfileName,
                      placeholder: "Your name",
                      key: "name",
                    },
                    {
                      label: "Phone Number",
                      value: profilePhone,
                      onChange: setProfilePhone,
                      placeholder: "+91 XXXXX XXXXX",
                      key: "phone",
                    },
                  ].map((field, i, arr) => (
                    <div key={field.key}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "13px 16px",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            ...IOS.font.subheadline,
                            color: IOS.label,
                            minWidth: 100,
                            fontWeight: 500,
                          }}
                        >
                          {field.label}
                        </div>
                        {profileEditing ? (
                          <input
                            data-ocid={`profile.${field.key === "name" ? "input" : "input"}`}
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder={field.placeholder}
                            style={{
                              flex: 1,
                              border: "none",
                              outline: "none",
                              ...IOS.font.subheadline,
                              color: IOS.label,
                              background: "transparent",
                              textAlign: "right",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              flex: 1,
                              ...IOS.font.subheadline,
                              color: field.value
                                ? IOS.label
                                : IOS.tertiaryLabel,
                              textAlign: "right",
                            }}
                          >
                            {field.value || field.placeholder}
                          </div>
                        )}
                      </div>
                      {i < arr.length - 1 && (
                        <div
                          style={{
                            height: 0.5,
                            background: IOS.separator,
                            marginLeft: 16,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Vehicle Info */}
                <div
                  style={{
                    ...IOS.font.footnote,
                    color: IOS.tertiaryLabel,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    paddingLeft: 4,
                    marginBottom: 4,
                    marginTop: 8,
                  }}
                >
                  Vehicle Info
                </div>
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {/* Vehicle Type */}
                  <div style={{ padding: "13px 16px" }}>
                    <div
                      style={{
                        ...IOS.font.subheadline,
                        color: IOS.label,
                        marginBottom: 8,
                        fontWeight: 500,
                      }}
                    >
                      Vehicle Type
                    </div>
                    {profileEditing ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["bike", "car", "other"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              setProfileVehicleType(t);
                            }}
                            style={{
                              flex: 1,
                              padding: "8px 4px",
                              borderRadius: 8,
                              border: "none",
                              cursor: "pointer",
                              background:
                                profileVehicleType === t
                                  ? IOS.blue
                                  : "rgba(120,120,128,0.12)",
                              color:
                                profileVehicleType === t ? "#fff" : IOS.label,
                              ...IOS.font.footnote,
                              fontWeight: 500,
                              textTransform: "capitalize",
                            }}
                          >
                            {t === "other"
                              ? "Other"
                              : t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          ...IOS.font.subheadline,
                          color: profileVehicleType
                            ? IOS.label
                            : IOS.tertiaryLabel,
                        }}
                      >
                        {profileVehicleType
                          ? profileVehicleType.charAt(0).toUpperCase() +
                            profileVehicleType.slice(1)
                          : "Not set"}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      height: 0.5,
                      background: IOS.separator,
                      marginLeft: 16,
                    }}
                  />
                  {[
                    {
                      label: "EV Model",
                      value: profileVehicleModel,
                      onChange: setProfileVehicleModel,
                      placeholder: "e.g. Ather 450X",
                      key: "model",
                    },
                    {
                      label: "Number Plate",
                      value: profilePlate,
                      onChange: setProfilePlate,
                      placeholder: "e.g. KA01AB1234",
                      key: "plate",
                    },
                    {
                      label: "Battery (kWh)",
                      value: profileCapacity,
                      onChange: setProfileCapacity,
                      placeholder: "e.g. 6.4",
                      key: "battery",
                    },
                  ].map((field, i, arr) => (
                    <div key={field.key}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "13px 16px",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            ...IOS.font.subheadline,
                            color: IOS.label,
                            minWidth: 100,
                            fontWeight: 500,
                          }}
                        >
                          {field.label}
                        </div>
                        {profileEditing ? (
                          <input
                            data-ocid="profile.input"
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder={field.placeholder}
                            style={{
                              flex: 1,
                              border: "none",
                              outline: "none",
                              ...IOS.font.subheadline,
                              color: IOS.label,
                              background: "transparent",
                              textAlign: "right",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              flex: 1,
                              ...IOS.font.subheadline,
                              color: field.value
                                ? IOS.label
                                : IOS.tertiaryLabel,
                              textAlign: "right",
                            }}
                          >
                            {field.value || field.placeholder}
                          </div>
                        )}
                      </div>
                      {i < arr.length - 1 && (
                        <div
                          style={{
                            height: 0.5,
                            background: IOS.separator,
                            marginLeft: 16,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: 20 }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── iOS Search Bar (top) ── */}
      <AnimatePresence>
        {!hasRoute && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              top: "max(env(safe-area-inset-top, 44px), 44px)",
              left: 68,
              right: 12,
              width: "calc(100vw - 80px)",
              maxWidth: 480,
              zIndex: 500,
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: IOS.blurLight,
                WebkitBackdropFilter: IOS.blurLight,
                borderRadius: IOS.radius.md,
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                display: "flex",
                alignItems: "center",
                height: 44,
                gap: 0,
                overflow: "hidden",
              }}
            >
              {/* Search icon */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px 0 14px",
                  color: IOS.tertiaryLabel,
                  flexShrink: 0,
                }}
              >
                <Search size={17} />
              </div>

              {/* Search input */}
              <input
                data-ocid="search.search_input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!sheetExpanded) setSheetExpanded(true);
                }}
                placeholder="Search"
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  ...IOS.font.body,
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Sora", system-ui, sans-serif',
                  fontWeight: searchQuery ? 400 : 400,
                  color: IOS.label,
                  background: "transparent",
                  padding: "0 4px",
                  WebkitTextSizeAdjust: "100%",
                  WebkitTapHighlightColor: "transparent",
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
                    padding: "0 8px",
                    display: "flex",
                    alignItems: "center",
                    color: IOS.tertiaryLabel,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── iOS Map Controls (right side) ── */}
      <div
        style={{
          position: "fixed",
          bottom: showInfoCard
            ? 220
            : sheetExpanded
              ? "calc(68vh + 16px)"
              : "calc(200px + 16px)",
          right: 12,
          zIndex: 450,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          transition: "bottom 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Layer toggle */}
        <button
          type="button"
          data-ocid="map.toggle"
          onClick={() =>
            setMapStyle((prev) =>
              prev === "standard" ? "satellite" : "standard",
            )
          }
          title={mapStyle === "standard" ? "Satellite view" : "Map view"}
          style={{
            width: 44,
            height: 44,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: IOS.blurThin,
            WebkitBackdropFilter: IOS.blurThin,
            border: "none",
            borderRadius: IOS.radius.xs,
            boxShadow: IOS.shadow.control,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            color: IOS.label,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Layers size={17} />
          <span
            style={{
              ...IOS.font.caption2,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {mapStyle === "standard" ? "SAT" : "MAP"}
          </span>
        </button>

        {/* Locate me */}
        <button
          type="button"
          data-ocid="location.button"
          onClick={handleLocateMe}
          title="My location"
          style={{
            width: 44,
            height: 44,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: IOS.blurThin,
            WebkitBackdropFilter: IOS.blurThin,
            border: "none",
            borderRadius: IOS.radius.xs,
            boxShadow: IOS.shadow.control,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: locationStatus === "success" ? IOS.blue : IOS.label,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-label="My location"
            role="img"
          >
            <title>My location</title>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
          </svg>
        </button>

        {/* Zoom cluster */}
        <div
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: IOS.blurThin,
            WebkitBackdropFilter: IOS.blurThin,
            borderRadius: IOS.radius.xs,
            boxShadow: IOS.shadow.control,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <button
            type="button"
            data-ocid="map.zoom_in_button"
            onClick={() => mapRef.current?.zoomIn()}
            style={{
              width: 44,
              height: 36,
              background: "none",
              border: "none",
              borderBottom: `0.5px solid ${IOS.separator}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: IOS.label,
              fontSize: 22,
              fontWeight: 300,
              lineHeight: 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            +
          </button>
          <button
            type="button"
            data-ocid="map.zoom_out_button"
            onClick={() => mapRef.current?.zoomOut()}
            style={{
              width: 44,
              height: 36,
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: IOS.label,
              fontSize: 22,
              fontWeight: 300,
              lineHeight: 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            −
          </button>
        </div>
      </div>

      {/* ── Station Info Card (iOS peek card) ── */}
      <AnimatePresence>
        {showInfoCard && selectedStationWithDist && (
          <StationInfoCard
            station={selectedStationWithDist}
            onClose={() => setSelectedStation(null)}
            onBookSlot={() => {
              openChargingModal(selectedStation!);
            }}
            onNavigate={() => {
              if (selectedStation) drawRoute(selectedStation, "Fast Charging");
            }}
          />
        )}
      </AnimatePresence>

      {/* ── iOS Bottom Sheet (station list) ── */}
      <AnimatePresence>
        {!showInfoCard && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              damping: 40,
              stiffness: 380,
              mass: 1,
            }}
            className="ios-bottom-sheet"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 400,
              transform: sheetExpanded
                ? "translateY(0)"
                : "translateY(calc(100% - 200px))",
              background: IOS.groupedBackground,
              backdropFilter: IOS.blur,
              WebkitBackdropFilter: IOS.blur,
              borderRadius: `${IOS.radius.md}px ${IOS.radius.md}px 0 0`,
              boxShadow: IOS.shadow.sheet,
              maxHeight: "68vh",
              display: "flex",
              flexDirection: "column",
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
                padding: "8px 16px 8px",
                flexShrink: 0,
                textAlign: "left",
                width: "100%",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-label={sheetExpanded ? "Collapse list" : "Expand list"}
            >
              {/* iOS handle */}
              <div
                style={{
                  width: 36,
                  height: 5,
                  background: "rgba(60,60,67,0.3)",
                  borderRadius: 2.5,
                  margin: "0 auto 10px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: IOS.radius.sm,
                      background: "rgba(52,199,89,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Zap size={16} color={IOS.green} />
                  </div>
                  <div>
                    <div
                      style={{
                        ...IOS.font.subheadline,
                        fontWeight: 600,
                        color: IOS.label,
                      }}
                    >
                      {searchQuery
                        ? `${filteredStations.length} result${filteredStations.length !== 1 ? "s" : ""}`
                        : "Nearby EV Stations"}
                    </div>
                    <div
                      style={{
                        ...IOS.font.caption1,
                        color: IOS.tertiaryLabel,
                        marginTop: 1,
                      }}
                    >
                      {stationsLoading
                        ? fetchStatus
                        : userLocation
                          ? "Sorted by distance"
                          : "Allow location for nearby stations"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {!stationsLoading && (
                    <span
                      style={{
                        ...IOS.font.caption2,
                        fontWeight: 700,
                        color: "#fff",
                        padding: "3px 9px",
                        borderRadius: IOS.radius.pill,
                        background: IOS.blue,
                      }}
                    >
                      {filteredStations.length}
                    </span>
                  )}
                  <button
                    type="button"
                    data-ocid="station.refresh_button"
                    title="Refresh stations"
                    onClick={(e) => {
                      e.stopPropagation();
                      stationsFetchedRef.current = false;
                      const loc =
                        lastFetchLocRef.current ??
                        userLocation ??
                        DEFAULT_CENTER;
                      loadStations(loc);
                      toast.info("Refreshing nearby stations...");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 6,
                      display: "flex",
                      alignItems: "center",
                      color: IOS.tertiaryLabel,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <ChevronDown
                    size={17}
                    color={IOS.tertiaryLabel}
                    style={{
                      transform: sheetExpanded ? "rotate(0)" : "rotate(-90deg)",
                      transition: "transform 0.22s",
                    }}
                  />
                </div>
              </div>
            </button>

            {/* iOS separator */}
            <div
              style={{
                height: "0.5px",
                background: IOS.separator,
                flexShrink: 0,
              }}
            />

            {/* Brand filter chips — iOS Maps category style */}
            <div
              style={{
                padding: "10px 16px 10px",
                flexShrink: 0,
              }}
            >
              <div
                className="ios-scroll"
                style={{
                  display: "flex",
                  gap: 6,
                  overflowX: "auto",
                  paddingBottom: 2,
                }}
              >
                {BRAND_CHIPS.map((chip) => {
                  const isActive =
                    (!activeBrand && chip.key === "all") ||
                    activeBrand === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      data-ocid="brand.filter.tab"
                      onClick={() =>
                        setActiveBrand(chip.key === "all" ? null : chip.key)
                      }
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 14px",
                        borderRadius: IOS.radius.pill,
                        border: "none",
                        background: isActive
                          ? IOS.blue
                          : "rgba(255,255,255,0.9)",
                        color: isActive ? "#fff" : IOS.label,
                        ...IOS.font.footnote,
                        fontWeight: isActive ? 600 : 400,
                        cursor: "pointer",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        whiteSpace: "nowrap",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <span style={{ fontSize: 11 }}>{chip.emoji}</span>
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* iOS separator */}
            <div
              style={{
                height: "0.5px",
                background: IOS.separator,
                flexShrink: 0,
              }}
            />

            {/* Login banner — iOS style */}
            <AnimatePresence>
              {!isLoggedIn && !loginBannerDismissed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ flexShrink: 0, overflow: "hidden" }}
                >
                  <div
                    style={{
                      margin: "8px 16px 4px",
                      background: "rgba(0,122,255,0.1)",
                      borderRadius: IOS.radius.md,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          ...IOS.font.footnote,
                          fontWeight: 600,
                          color: IOS.blue,
                        }}
                      >
                        Sign in to book charging slots
                      </div>
                      <div
                        style={{
                          ...IOS.font.caption2,
                          color: IOS.tertiaryLabel,
                          marginTop: 1,
                        }}
                      >
                        Login with Internet Identity
                      </div>
                    </div>
                    <button
                      type="button"
                      data-ocid="login_banner.button"
                      onClick={login}
                      disabled={isLoggingIn || isInitializing}
                      style={{
                        background: IOS.blue,
                        color: "#fff",
                        border: "none",
                        borderRadius: IOS.radius.sm,
                        padding: "6px 14px",
                        ...IOS.font.footnote,
                        fontWeight: 600,
                        cursor: "pointer",
                        flexShrink: 0,
                        opacity: isLoggingIn || isInitializing ? 0.7 : 1,
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      data-ocid="login_banner.close_button"
                      onClick={() => setLoginBannerDismissed(true)}
                      style={{
                        background: "rgba(120,120,128,0.12)",
                        border: "none",
                        borderRadius: IOS.radius.xs,
                        padding: 4,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        color: IOS.tertiaryLabel,
                        flexShrink: 0,
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Station list */}
            <div
              ref={stationListRef}
              className="ios-scroll"
              style={{
                overflowY: "auto",
                flex: 1,
                padding: "8px 16px 0",
              }}
            >
              {stationsLoading && (
                <div
                  data-ocid="station.loading_state"
                  style={{
                    textAlign: "center",
                    padding: "28px 16px",
                    color: IOS.tertiaryLabel,
                    ...IOS.font.footnote,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: `2.5px solid ${IOS.blue}`,
                      borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  {fetchStatus}
                </div>
              )}

              {!stationsLoading && stationsFetchError && (
                <div
                  data-ocid="station.error_state"
                  style={{
                    textAlign: "center",
                    padding: "28px 16px",
                    color: IOS.red,
                    ...IOS.font.footnote,
                    lineHeight: 1.6,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span>
                    Could not find stations nearby. Check your internet
                    connection.
                  </span>
                  <button
                    type="button"
                    data-ocid="station.retry_button"
                    onClick={() => {
                      stationsFetchedRef.current = false;
                      const loc =
                        lastFetchLocRef.current ??
                        userLocation ??
                        DEFAULT_CENTER;
                      loadStations(loc);
                    }}
                    style={{
                      background: IOS.blue,
                      color: "#fff",
                      border: "none",
                      borderRadius: IOS.radius.sm,
                      padding: "8px 20px",
                      ...IOS.font.footnote,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <RefreshCw size={13} /> Retry
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
                      padding: "28px 16px",
                      color: IOS.tertiaryLabel,
                      ...IOS.font.footnote,
                    }}
                  >
                    Getting your location to find nearby stations...
                  </div>
                )}

              {filteredStations.length === 0 &&
                stations.length > 0 &&
                !stationsLoading && (
                  <div
                    data-ocid="station.empty_state"
                    style={{
                      textAlign: "center",
                      padding: "28px 16px",
                      color: IOS.tertiaryLabel,
                      ...IOS.font.subheadline,
                    }}
                  >
                    No stations match your search
                  </div>
                )}

              {/* iOS grouped list rows */}
              {filteredStations.length > 0 && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.8)",
                    borderRadius: IOS.radius.md,
                    overflow: "hidden",
                    marginBottom: 8,
                  }}
                >
                  {filteredStations.map((station, index) => {
                    const ocidIndex = index + 1;
                    const isSelected = selectedStation?.id === station.id;
                    const isLast = index === filteredStations.length - 1;
                    const distStr =
                      station.distance !== null
                        ? station.distance < 1
                          ? `${Math.round(station.distance * 1000)} m`
                          : `${station.distance.toFixed(1)} km`
                        : null;

                    const brandCfg = station.brand
                      ? BRAND_CONFIG[station.brand]
                      : null;

                    return (
                      <div key={station.id}>
                        <button
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
                            background: isSelected
                              ? "rgba(0,122,255,0.06)"
                              : "transparent",
                            border: "none",
                            padding: "11px 14px",
                            cursor: "pointer",
                            textAlign: "left",
                            gap: 12,
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          {/* Station icon */}
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: IOS.radius.sm,
                              background: station.isAvailable
                                ? "rgba(52,199,89,0.12)"
                                : "rgba(255,59,48,0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Zap
                              size={18}
                              color={station.isAvailable ? IOS.green : IOS.red}
                            />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                ...IOS.font.subheadline,
                                fontWeight: 600,
                                color: IOS.label,
                                marginBottom: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {station.name}
                            </div>
                            <div
                              style={{
                                ...IOS.font.caption1,
                                color: IOS.tertiaryLabel,
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                flexWrap: "wrap",
                              }}
                            >
                              {brandCfg && (
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: brandCfg.color,
                                  }}
                                >
                                  {brandCfg.emoji} {brandCfg.label}
                                </span>
                              )}
                              {brandCfg && distStr && (
                                <span
                                  style={{
                                    color: IOS.separator,
                                  }}
                                >
                                  ·
                                </span>
                              )}
                              {distStr && <span>{distStr}</span>}
                              <span style={{ color: IOS.quaternaryLabel }}>
                                ·
                              </span>
                              <span
                                style={{
                                  color: station.isAvailable
                                    ? IOS.green
                                    : IOS.red,
                                  fontWeight: 600,
                                }}
                              >
                                {station.isAvailable ? "Open" : "Closed"}
                              </span>
                            </div>
                          </div>

                          {/* iOS disclosure chevron or navigate */}
                          <button
                            type="button"
                            data-ocid={`station.navigate_button.${ocidIndex}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectStation(station);
                            }}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: isSelected
                                ? IOS.blue
                                : "rgba(0,122,255,0.1)",
                              color: isSelected ? "#fff" : IOS.blue,
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              WebkitTapHighlightColor: "transparent",
                            }}
                            title="View station"
                          >
                            <Navigation size={14} />
                          </button>
                        </button>

                        {/* iOS inset separator (except last row) */}
                        {!isLast && (
                          <div
                            style={{
                              height: "0.5px",
                              background: IOS.separator,
                              marginLeft: 66,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div
                style={{
                  textAlign: "center",
                  padding: "6px 0 max(env(safe-area-inset-bottom, 0px), 20px)",
                  ...IOS.font.caption2,
                  color: IOS.tertiaryLabel,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  alignItems: "center",
                }}
              >
                <span>
                  Data from{" "}
                  <a
                    href="https://openchargemap.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: IOS.blue, textDecoration: "none" }}
                  >
                    Open Charge Map
                  </a>{" "}
                  &{" "}
                  <a
                    href="https://www.openstreetmap.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: IOS.blue, textDecoration: "none" }}
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
                    style={{ color: IOS.blue, textDecoration: "none" }}
                  >
                    Built with ❤️ using caffeine.ai
                  </a>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── My Bookings Panel ── */}
      <MyBookings
        open={myBookingsOpen}
        onClose={() => setMyBookingsOpen(false)}
        stationNameMap={stationNameMap}
      />

      {/* ── iOS Booking Modal (multi-step bottom sheet) ── */}
      <AnimatePresence>
        {modalStation && (
          <>
            {/* iOS-style dim overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => {
                if (modalStep !== "booking-success") setModalStation(null);
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 800,
              }}
            />

            <motion.div
              data-ocid="charging.dialog"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                background: IOS.groupedBackground,
                backdropFilter: IOS.blur,
                WebkitBackdropFilter: IOS.blur,
                borderRadius: `${IOS.radius.lg}px ${IOS.radius.lg}px 0 0`,
                padding: "0 0 max(env(safe-area-inset-bottom, 0px), 20px)",
                zIndex: 900,
                maxHeight: "92vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* iOS handle */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "10px 0 4px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 5,
                    background: "rgba(60,60,67,0.3)",
                    borderRadius: 2.5,
                  }}
                />
              </div>

              <div style={{ padding: "6px 20px 0", flex: 1 }}>
                {/* Step 1: Charging type */}
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
                            ...IOS.font.title3,
                            color: IOS.label,
                            marginBottom: 3,
                          }}
                        >
                          Charging Type
                        </div>
                        <div
                          style={{
                            ...IOS.font.footnote,
                            color: IOS.tertiaryLabel,
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
                          background: IOS.fill,
                          border: "none",
                          borderRadius: "50%",
                          width: 30,
                          height: 30,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: IOS.tertiaryLabel,
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* iOS section header */}
                    <div style={{ ...IOS.sectionHeader, marginBottom: 8 }}>
                      Select Option
                    </div>

                    <div
                      style={{
                        background: "rgba(255,255,255,0.8)",
                        borderRadius: IOS.radius.md,
                        overflow: "hidden",
                        marginBottom: 16,
                      }}
                    >
                      {modalStation.chargingTypes.map((type, idx) => {
                        const cfg = CHARGING_CONFIGS[type];
                        const isLast =
                          idx === modalStation.chargingTypes.length - 1;
                        return (
                          <div key={type}>
                            <motion.button
                              type="button"
                              data-ocid={cfg.ocid}
                              whileTap={{ opacity: 0.7 }}
                              onClick={() => handleChargingTypeSelect(type)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                padding: "13px 16px",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                textAlign: "left",
                                width: "100%",
                                WebkitTapHighlightColor: "transparent",
                              }}
                            >
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: IOS.radius.sm,
                                  background: `${cfg.color}18`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 18,
                                  flexShrink: 0,
                                }}
                              >
                                {cfg.icon}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    ...IOS.font.subheadline,
                                    fontWeight: 600,
                                    color: IOS.label,
                                    marginBottom: 2,
                                  }}
                                >
                                  {type}
                                </div>
                                <div
                                  style={{
                                    ...IOS.font.caption1,
                                    color: IOS.tertiaryLabel,
                                  }}
                                >
                                  {cfg.description}
                                </div>
                              </div>
                              <svg
                                width="8"
                                height="14"
                                viewBox="0 0 8 14"
                                fill="none"
                                role="img"
                                aria-label="Select"
                              >
                                <title>Select</title>
                                <path
                                  d="M1 1l6 6-6 6"
                                  stroke={IOS.tertiaryLabel}
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </motion.button>
                            {!isLast && (
                              <div
                                style={{
                                  height: "0.5px",
                                  background: IOS.separator,
                                  marginLeft: 66,
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {!isLoggedIn && (
                      <div
                        style={{
                          padding: "10px 14px",
                          background: "rgba(0,122,255,0.08)",
                          borderRadius: IOS.radius.md,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>🔒</span>
                          <span
                            style={{
                              ...IOS.font.footnote,
                              color: IOS.blue,
                              fontWeight: 600,
                            }}
                          >
                            Sign in required to complete booking
                          </span>
                        </div>
                        <button
                          type="button"
                          data-ocid="login.button"
                          onClick={login}
                          disabled={isLoggingIn || isInitializing}
                          style={{
                            background: IOS.blue,
                            color: "#fff",
                            border: "none",
                            borderRadius: IOS.radius.sm,
                            padding: "5px 14px",
                            ...IOS.font.caption1,
                            fontWeight: 600,
                            cursor: "pointer",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          <LogIn size={11} />
                          Sign In
                        </button>
                      </div>
                    )}
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
                            ...IOS.font.title3,
                            color: IOS.label,
                            marginBottom: 3,
                          }}
                        >
                          Register Vehicle
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              padding: "2px 10px",
                              borderRadius: IOS.radius.pill,
                              background: `${CHARGING_CONFIGS[selectedChargingType]?.color ?? "#888"}18`,
                              color:
                                CHARGING_CONFIGS[selectedChargingType]?.color ??
                                "#888",
                              ...IOS.font.caption2,
                              fontWeight: 600,
                            }}
                          >
                            {CHARGING_CONFIGS[selectedChargingType]?.icon}{" "}
                            {selectedChargingType}
                          </span>
                          <span
                            style={{
                              ...IOS.font.caption1,
                              color: IOS.tertiaryLabel,
                            }}
                          >
                            at {modalStation.name}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalStep("charging-type")}
                        style={{
                          background: IOS.fill,
                          border: "none",
                          borderRadius: "50%",
                          width: 30,
                          height: 30,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: IOS.tertiaryLabel,
                          fontSize: 18,
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        ←
                      </button>
                    </div>
                    {/* Auto-fill chip */}
                    {autoFilledFromProfile && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 14,
                          padding: "8px 12px",
                          borderRadius: IOS.radius.lg,
                          background: "#007AFF18",
                          border: "1px solid #007AFF40",
                        }}
                      >
                        <span style={{ fontSize: 14 }}>✓</span>
                        <span
                          style={{
                            ...IOS.font.caption1,
                            color: "#007AFF",
                            flex: 1,
                          }}
                        >
                          Auto-filled from your saved profile
                        </span>
                        <button
                          type="button"
                          onClick={() => setAutoFilledFromProfile(false)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#007AFF",
                            cursor: "pointer",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 20,
                      }}
                    >
                      {/* Vehicle type — iOS segmented control style */}
                      <div>
                        <div style={{ ...IOS.sectionHeader, marginBottom: 8 }}>
                          Vehicle Type
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 8,
                          }}
                        >
                          {(
                            [
                              { key: "bike", label: "Bike", icon: "🛵" },
                              { key: "car", label: "Car", icon: "🚗" },
                              { key: "other", label: "Other", icon: "🚌" },
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
                                gap: 4,
                                padding: "11px 6px",
                                borderRadius: IOS.radius.sm,
                                border: "none",
                                background:
                                  vehicleType === key
                                    ? IOS.blue
                                    : "rgba(255,255,255,0.8)",
                                cursor: "pointer",
                                boxShadow:
                                  vehicleType === key
                                    ? "none"
                                    : "0 1px 3px rgba(0,0,0,0.1)",
                                WebkitTapHighlightColor: "transparent",
                              }}
                            >
                              <span style={{ fontSize: 22 }}>{icon}</span>
                              <span
                                style={{
                                  ...IOS.font.caption1,
                                  fontWeight: vehicleType === key ? 600 : 400,
                                  color:
                                    vehicleType === key ? "#fff" : IOS.label,
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
                        <div style={{ ...IOS.sectionHeader, marginBottom: 8 }}>
                          EV Model
                        </div>
                        <div
                          style={{
                            background: "rgba(255,255,255,0.8)",
                            borderRadius: IOS.radius.md,
                            overflow: "hidden",
                          }}
                        >
                          <label
                            htmlFor="ev-model-select"
                            style={{ display: "none" }}
                          >
                            EV Model
                          </label>
                          <select
                            id="ev-model-select"
                            data-ocid="vehicle.select"
                            value={vehiclePresetIdx}
                            onChange={(e) =>
                              setVehiclePresetIdx(
                                Number.parseInt(e.target.value),
                              )
                            }
                            style={{
                              ...iosInputStyle,
                              appearance: "none",
                              WebkitAppearance: "none",
                            }}
                          >
                            {EV_PRESETS.map((p, i) => (
                              <option key={p.label} value={i}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Vehicle number */}
                      <div>
                        <div style={{ ...IOS.sectionHeader, marginBottom: 8 }}>
                          Vehicle Number / Name
                        </div>
                        <div
                          style={{
                            background: "rgba(255,255,255,0.8)",
                            borderRadius: IOS.radius.md,
                            overflow: "hidden",
                          }}
                        >
                          <label
                            htmlFor="vehicle-name-input"
                            style={{ display: "none" }}
                          >
                            Vehicle Number
                          </label>
                          <input
                            id="vehicle-name-input"
                            data-ocid="vehicle.input"
                            type="text"
                            value={vehicleName}
                            onChange={(e) => setVehicleName(e.target.value)}
                            placeholder={
                              localStorage.getItem("ev_profile_plate") ||
                              "e.g. MH12 AB 1234"
                            }
                            style={iosInputStyle}
                          />
                        </div>
                      </div>

                      {/* Custom capacity */}
                      {selectedPreset.label === "Custom" && (
                        <div>
                          <div
                            style={{ ...IOS.sectionHeader, marginBottom: 8 }}
                          >
                            Battery Capacity (kWh)
                          </div>
                          <div
                            style={{
                              background: "rgba(255,255,255,0.8)",
                              borderRadius: IOS.radius.md,
                              overflow: "hidden",
                            }}
                          >
                            <label
                              htmlFor="vehicle-capacity-input"
                              style={{ display: "none" }}
                            >
                              Battery Capacity
                            </label>
                            <input
                              id="vehicle-capacity-input"
                              data-ocid="vehicle.capacity_input"
                              type="number"
                              min="1"
                              max="200"
                              value={customCapacity}
                              onChange={(e) =>
                                setCustomCapacity(e.target.value)
                              }
                              placeholder="e.g. 40"
                              style={iosInputStyle}
                            />
                          </div>
                        </div>
                      )}

                      {/* Battery level */}
                      <div>
                        <div style={{ ...IOS.sectionHeader, marginBottom: 8 }}>
                          Current Battery Level:{" "}
                          <span
                            style={{ color: IOS.blue, textTransform: "none" }}
                          >
                            {currentCharge}%
                          </span>
                        </div>
                        <label
                          htmlFor="vehicle-battery-input"
                          style={{ display: "none" }}
                        >
                          Battery Level
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
                            accentColor: IOS.blue,
                            cursor: "pointer",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            ...IOS.font.caption2,
                            color: IOS.tertiaryLabel,
                            marginTop: 3,
                          }}
                        >
                          <span>0%</span>
                          <span>50%</span>
                          <span>95%</span>
                        </div>
                      </div>

                      {/* Estimate preview — iOS style */}
                      <div
                        style={{
                          background: "rgba(0,122,255,0.08)",
                          borderRadius: IOS.radius.md,
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <BatteryCharging size={16} color={IOS.blue} />
                        <span
                          style={{
                            ...IOS.font.footnote,
                            color: IOS.blue,
                            fontWeight: 600,
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

                      {/* iOS primary button */}
                      <button
                        type="button"
                        data-ocid="vehicle.submit_button"
                        onClick={handleVehicleRegister}
                        style={IOS.primaryButton}
                      >
                        <Calendar size={16} />
                        Select Time Slot
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

                {/* Step 4: Success */}
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

                {/* GPS warning */}
                {locationStatus !== "success" &&
                  modalStep !== "booking-success" && (
                    <div
                      style={{
                        marginTop: 12,
                        marginBottom: 4,
                        padding: "10px 14px",
                        background: "rgba(0,122,255,0.08)",
                        borderRadius: IOS.radius.sm,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <RefreshCw size={13} color={IOS.blue} />
                      <span
                        style={{
                          ...IOS.font.caption1,
                          color: IOS.blue,
                          fontWeight: 500,
                        }}
                      >
                        Allow location access to get turn-by-turn directions.
                      </span>
                    </div>
                  )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Location loading pill ── */}
      <AnimatePresence>
        {locationStatus === "loading" && !hasRoute && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            style={{
              position: "fixed",
              top: "calc(max(env(safe-area-inset-top, 44px), 44px) + 56px)",
              right: 12,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: IOS.blurLight,
              WebkitBackdropFilter: IOS.blurLight,
              borderRadius: IOS.radius.pill,
              padding: "7px 14px",
              boxShadow: IOS.shadow.card,
              zIndex: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              ...IOS.font.caption1,
              color: IOS.tertiaryLabel,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: `2px solid ${IOS.blue}`,
                borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Getting your location…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

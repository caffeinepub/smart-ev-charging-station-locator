// Minimal type shims for Leaflet + Leaflet Routing Machine loaded via CDN script tags.
// These replicate only what EVChargingApp.tsx actually uses.

declare namespace L {
  interface LatLng {
    lat: number;
    lng: number;
  }

  interface LatLngBounds {
    extend(latlng: LatLng): LatLngBounds;
  }

  interface MarkerOptions {
    icon?: DivIcon | Icon;
    zIndexOffset?: number;
    title?: string;
  }

  interface DivIconOptions {
    html: string;
    className?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }

  interface DivIcon {
    options: DivIconOptions;
  }

  interface IconOptions {
    iconUrl?: string;
    iconRetinaUrl?: string;
    shadowUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }

  interface Icon {
    options: IconOptions;
  }

  interface IconDefault extends Icon {
    mergeOptions(options: Partial<IconOptions>): void;
  }

  interface TooltipOptions {
    permanent?: boolean;
    className?: string;
    direction?: string;
  }

  interface PopupOptions {
    maxWidth?: number;
    className?: string;
  }

  interface Popup {
    setContent(content: string | HTMLElement): Popup;
  }

  interface Marker {
    addTo(map: Map): Marker;
    remove(): void;
    setLatLng(latlng: LatLng | [number, number]): Marker;
    setIcon(icon: DivIcon | Icon): Marker;
    bindPopup(
      popup: Popup | string | HTMLElement,
      options?: PopupOptions,
    ): Marker;
    bindTooltip(tooltip: string, options?: TooltipOptions): Marker;
    openPopup(): Marker;
    on(event: string, handler: (e?: unknown) => void): Marker;
    getLatLng(): LatLng;
  }

  interface CircleOptions {
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    weight?: number;
    opacity?: number;
  }

  interface Circle {
    addTo(map: Map): Circle;
    remove(): void;
    setLatLng(latlng: LatLng | [number, number]): Circle;
    setRadius(radius: number): Circle;
  }

  interface TileLayerOptions {
    attribution?: string;
    subdomains?: string;
    maxZoom?: number;
    keepBuffer?: number;
  }

  interface TileLayer {
    addTo(map: Map): TileLayer;
    remove(): void;
    setUrl(url: string): TileLayer;
  }

  interface MapOptions {
    center?: [number, number] | LatLng;
    zoom?: number;
    zoomControl?: boolean;
    attributionControl?: boolean;
  }

  interface FitBoundsOptions {
    padding?: [number, number];
    animate?: boolean;
    duration?: number;
  }

  interface ZoomOptions {
    animate?: boolean;
    duration?: number;
  }

  interface PanOptions {
    animate?: boolean;
    duration?: number;
  }

  interface Map {
    addLayer(layer: TileLayer | Marker | Circle): void;
    removeLayer(layer: TileLayer | Marker | Circle): void;
    remove(): void;
    setView(
      center: [number, number] | LatLng,
      zoom: number,
      options?: PanOptions,
    ): Map;
    flyTo(
      center: [number, number] | LatLng,
      zoom: number,
      options?: ZoomOptions,
    ): Map;
    getZoom(): number;
    zoomIn(delta?: number): Map;
    zoomOut(delta?: number): Map;
    invalidateSize(options?: { animate: boolean }): Map;
    fitBounds(bounds: LatLngBounds, options?: FitBoundsOptions): Map;
    on(event: string, handler: (e?: unknown) => void): Map;
  }

  interface ZoomControl {
    addTo(map: Map): ZoomControl;
  }

  namespace control {
    function zoom(options?: { position?: string }): ZoomControl;
  }

  namespace Routing {
    interface RoutingLineOptions {
      styles: Array<{ color: string; weight: number; opacity: number }>;
      extendToWaypoints?: boolean;
      missingRouteTolerance?: number;
    }

    interface RoutingControlOptions {
      waypoints: LatLng[];
      routeWhileDragging?: boolean;
      addWaypoints?: boolean;
      fitSelectedRoutes?: boolean;
      showAlternatives?: boolean;
      lineOptions?: RoutingLineOptions;
      router?: unknown;
      plan?: unknown;
    }

    interface Control {
      addTo(map: Map): Control;
      remove(): void;
    }

    function control(options: RoutingControlOptions): Control;
    function osrmv1(options: { serviceUrl: string }): unknown;
    function plan(
      waypoints: LatLng[],
      options: { createMarker: () => false | Marker },
    ): unknown;
  }

  // Factory functions
  function map(element: HTMLElement, options?: MapOptions): Map;
  function tileLayer(
    urlTemplate: string,
    options?: TileLayerOptions,
  ): TileLayer;
  function marker(
    latlng: [number, number] | LatLng,
    options?: MarkerOptions,
  ): Marker;
  function circle(
    latlng: [number, number] | LatLng,
    options?: CircleOptions,
  ): Circle;
  function latLng(lat: number, lng: number): LatLng;
  function latLngBounds(sw: LatLng, ne: LatLng): LatLngBounds;
  function popup(options?: PopupOptions): Popup;
  function divIcon(options: DivIconOptions): DivIcon;

  const Icon: {
    Default: {
      prototype: Icon & { _getIconUrl?: unknown };
      mergeOptions(options: Partial<IconOptions>): void;
    };
  };
}

// Make L available as a global variable (loaded via CDN)
declare const L: typeof L;

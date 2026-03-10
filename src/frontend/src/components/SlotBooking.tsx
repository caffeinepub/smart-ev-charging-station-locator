import {
  CheckCircle,
  ChevronLeft,
  Clock,
  Loader2,
  LogIn,
  MapPin,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useBookSlot, useGetAvailableSlots } from "../hooks/useQueries";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BookingConfirmation {
  bookingId: bigint;
  stationName: string;
  scheduledTime: Date;
  chargingType: string;
  vehiclePlate: string;
  estimatedDurationMinutes: number;
}

interface UIStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  chargingTypes: string[];
  isAvailable: boolean;
}

interface SlotBookingProps {
  station: UIStation;
  chargingType: string;
  vehiclePlate: string;
  estimatedDurationMinutes: number;
  onBack: () => void;
  onConfirmed: (confirmation: BookingConfirmation) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FONT = "Sora, system-ui, sans-serif";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDayLabel(date: Date, today: Date): string {
  const isToday = date.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Returns 8am and 10pm nanosecond timestamps for the given day */
function getDayRange(date: Date): { start: bigint; end: bigint } {
  const start = new Date(date);
  start.setHours(8, 0, 0, 0);
  const end = new Date(date);
  end.setHours(22, 0, 0, 0); // 10pm — backend stops before this
  return {
    start: BigInt(start.getTime()) * 1_000_000n,
    end: BigInt(end.getTime()) * 1_000_000n,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SlotBooking({
  station,
  chargingType,
  vehiclePlate,
  estimatedDurationMinutes,
  onBack,
  onConfirmed,
}: SlotBookingProps) {
  const { identity, login, isLoggingIn, isInitializing } =
    useInternetIdentity();
  const isLoggedIn = !!identity;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return d;
      }),
    [today],
  );

  const [selectedDay, setSelectedDay] = useState<Date>(days[0]);
  const [selectedSlotTime, setSelectedSlotTime] = useState<bigint | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  const stationIdBig = useMemo(() => {
    const numeric = Number(station.id.replace(/\D/g, "").slice(0, 15));
    return BigInt(
      Number.isFinite(numeric) && numeric > 0
        ? numeric
        : Math.abs(
            station.id
              .split("")
              .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0),
          ) || 1,
    );
  }, [station.id]);

  const { start: dayStart, end: dayEnd } = useMemo(
    () => getDayRange(selectedDay),
    [selectedDay],
  );

  const { data: slots = [], isLoading: slotsLoading } = useGetAvailableSlots(
    stationIdBig,
    dayStart,
    dayEnd,
  );

  const bookSlot = useBookSlot();

  // Current time in nanoseconds
  const nowNs = BigInt(Date.now()) * 1_000_000n;

  const handleConfirm = useCallback(async () => {
    if (!selectedSlotTime) {
      toast.error("Please select a time slot");
      return;
    }
    if (!isLoggedIn) {
      toast.error("Please log in to book a slot");
      return;
    }

    setIsBooking(true);
    try {
      const bookingId = await bookSlot.mutateAsync({
        stationId: stationIdBig,
        chargingType,
        vehiclePlate,
        scheduledTime: selectedSlotTime,
        estimatedDurationMinutes: BigInt(estimatedDurationMinutes),
      });

      const scheduledDate = new Date(Number(selectedSlotTime / 1_000_000n));
      onConfirmed({
        bookingId,
        stationName: station.name,
        scheduledTime: scheduledDate,
        chargingType,
        vehiclePlate,
        estimatedDurationMinutes,
      });
      toast.success("Slot booked successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to book slot";
      if (
        msg.toLowerCase().includes("already booked") ||
        msg.toLowerCase().includes("slot already")
      ) {
        toast.error(
          "This slot was just booked by someone else. Please choose another.",
        );
      } else {
        toast.error(`Booking failed: ${msg}`);
      }
    } finally {
      setIsBooking(false);
    }
  }, [
    selectedSlotTime,
    isLoggedIn,
    bookSlot,
    stationIdBig,
    chargingType,
    vehiclePlate,
    estimatedDurationMinutes,
    station.name,
    onConfirmed,
  ]);

  const chargingColor =
    chargingType === "Fast Charging"
      ? "#f59e0b"
      : chargingType === "Slow Charging"
        ? "#22c55e"
        : "#3b82f6";

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
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
              marginBottom: 4,
            }}
          >
            Pick a Time Slot
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MapPin size={12} color={chargingColor} />
            {station.name}
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 8,
                background: `${chargingColor}18`,
                color: chargingColor,
                fontWeight: 600,
                fontSize: 11,
                marginLeft: 2,
              }}
            >
              {chargingType}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
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
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Login gate */}
      {!isLoggedIn && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
            border: "1.5px solid #bfdbfe",
            borderRadius: 14,
            padding: "16px 18px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#1a73e8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <LogIn size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#1e40af",
                marginBottom: 2,
              }}
            >
              Sign in to book a slot
            </div>
            <div style={{ fontSize: 12, color: "#3b82f6" }}>
              Login required to reserve charging slots
            </div>
          </div>
          <button
            type="button"
            data-ocid="slot.login_button"
            onClick={login}
            disabled={isLoggingIn || isInitializing}
            style={{
              background: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              cursor: isLoggingIn ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              opacity: isLoggingIn ? 0.7 : 1,
            }}
          >
            {isLoggingIn ? (
              <Loader2
                size={14}
                style={{ animation: "spin 0.8s linear infinite" }}
              />
            ) : null}
            {isLoggingIn ? "Signing in..." : "Sign In"}
          </button>
        </motion.div>
      )}

      {/* Day selector */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          Select Date
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
          }}
        >
          {days.map((day, i) => {
            const isSelected =
              day.toDateString() === selectedDay.toDateString();
            return (
              <button
                key={day.toISOString()}
                type="button"
                data-ocid={`slot.day_select.${i + 1}`}
                onClick={() => {
                  setSelectedDay(day);
                  setSelectedSlotTime(null);
                }}
                style={{
                  flexShrink: 0,
                  padding: "8px 14px",
                  borderRadius: 12,
                  border: `2px solid ${isSelected ? "#1a73e8" : "#e5e7eb"}`,
                  background: isSelected ? "#1a73e8" : "#fff",
                  color: isSelected ? "#fff" : "#374151",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  fontFamily: FONT,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {formatDayLabel(day, new Date())}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Clock size={12} />
          Available Slots (8am – 10pm)
        </div>

        {slotsLoading ? (
          <div
            data-ocid="slot.loading_state"
            style={{
              textAlign: "center",
              padding: "24px 0",
              color: "#9ca3af",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Loader2
              size={16}
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            Loading slots…
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
              gap: 8,
            }}
          >
            {slots.map((slot) => {
              const slotDate = new Date(Number(slot.slotTime / 1_000_000n));
              const isPast = slot.slotTime < nowNs;
              const isBooked = !slot.isAvailable && !isPast;
              const isUnavailable = !slot.isAvailable || isPast;
              const isSelected = selectedSlotTime === slot.slotTime;

              let borderColor = "#bbf7d0";
              let bgColor = "#f0fdf4";
              let textColor = "#16a34a";
              let cursor = "pointer";

              if (isSelected) {
                borderColor = "#1a73e8";
                bgColor = "#1a73e8";
                textColor = "#fff";
              } else if (isBooked) {
                borderColor = "#fecaca";
                bgColor = "#fff1f1";
                textColor = "#dc2626";
                cursor = "not-allowed";
              } else if (isPast) {
                borderColor = "#e5e7eb";
                bgColor = "#f9fafb";
                textColor = "#d1d5db";
                cursor = "not-allowed";
              }

              return (
                <button
                  key={slot.slotTime.toString()}
                  type="button"
                  data-ocid="slot.time_slot.button"
                  disabled={isUnavailable}
                  onClick={() =>
                    setSelectedSlotTime(isSelected ? null : slot.slotTime)
                  }
                  style={{
                    padding: "10px 6px",
                    borderRadius: 10,
                    border: `2px solid ${borderColor}`,
                    background: bgColor,
                    color: textColor,
                    cursor,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: FONT,
                    transition: "all 0.12s",
                    textAlign: "center",
                    position: "relative",
                    lineHeight: 1.3,
                  }}
                  title={
                    isPast
                      ? "Past slot"
                      : isBooked
                        ? "Slot already booked"
                        : "Available — tap to select"
                  }
                >
                  {formatTime(slotDate)}
                  {isBooked && (
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#dc2626",
                        marginTop: 2,
                        letterSpacing: "0.03em",
                      }}
                    >
                      BOOKED
                    </div>
                  )}
                  {!isUnavailable && !isSelected && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#22c55e",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected slot summary */}
      <AnimatePresence>
        {selectedSlotTime && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            style={{
              background: "#f0fdf4",
              border: "1.5px solid #86efac",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Zap size={16} color="#16a34a" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 1 }}>
                Selected slot
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>
                {formatDayLabel(selectedDay, new Date())} at{" "}
                {formatTime(new Date(Number(selectedSlotTime / 1_000_000n)))}
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#16a34a",
                padding: "3px 8px",
                background: "#dcfce7",
                borderRadius: 8,
              }}
            >
              ~{estimatedDurationMinutes} min
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm button */}
      <button
        type="button"
        data-ocid="slot.confirm_button"
        disabled={!selectedSlotTime || isBooking || !isLoggedIn}
        onClick={handleConfirm}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 14,
          border: "none",
          background:
            !selectedSlotTime || isBooking || !isLoggedIn
              ? "#e5e7eb"
              : "#1a73e8",
          color:
            !selectedSlotTime || isBooking || !isLoggedIn ? "#9ca3af" : "#fff",
          cursor:
            !selectedSlotTime || isBooking || !isLoggedIn
              ? "not-allowed"
              : "pointer",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 0.15s",
        }}
      >
        {isBooking ? (
          <>
            <Loader2
              size={16}
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            Booking…
          </>
        ) : (
          <>
            <CheckCircle size={16} />
            {!isLoggedIn
              ? "Sign In to Confirm"
              : !selectedSlotTime
                ? "Select a Slot"
                : "Confirm Booking"}
          </>
        )}
      </button>
    </div>
  );
}

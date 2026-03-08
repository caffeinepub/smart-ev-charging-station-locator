import { ArrowLeft, BookOpen, Calendar, Clock, Zap } from "lucide-react";
import { motion } from "motion/react";
import type { BookingConfirmation } from "./SlotBooking";

interface BookingSuccessProps {
  confirmation: BookingConfirmation;
  onViewMyBookings: () => void;
  onBackToMap: () => void;
}

const FONT = "Sora, system-ui, sans-serif";

const CHARGING_COLORS: Record<string, string> = {
  "Fast Charging": "#f59e0b",
  "Slow Charging": "#22c55e",
  "Battery Swapping": "#3b82f6",
};

const CHARGING_ICONS: Record<string, string> = {
  "Fast Charging": "⚡",
  "Slow Charging": "🔋",
  "Battery Swapping": "🔄",
};

export function BookingSuccess({
  confirmation,
  onViewMyBookings,
  onBackToMap,
}: BookingSuccessProps) {
  const {
    bookingId,
    stationName,
    scheduledTime,
    chargingType,
    vehiclePlate,
    estimatedDurationMinutes,
  } = confirmation;

  const chargingColor = CHARGING_COLORS[chargingType] ?? "#1a73e8";
  const chargingIcon = CHARGING_ICONS[chargingType] ?? "⚡";

  const dateStr = scheduledTime.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = scheduledTime.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <motion.div
      data-ocid="booking.success_card"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 200 }}
      style={{ fontFamily: FONT, textAlign: "center", padding: "8px 0 12px" }}
    >
      {/* Success animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 14, stiffness: 200, delay: 0.1 }}
        style={{ fontSize: 56, marginBottom: 10 }}
      >
        ✅
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#1f2937",
            marginBottom: 4,
          }}
        >
          Slot Booked!
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
          Booking ID:{" "}
          <strong style={{ color: "#1a73e8" }}>#{bookingId.toString()}</strong>
        </div>
      </motion.div>

      {/* Details card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{
          background: "#fff",
          border: "1.5px solid #e5e7eb",
          borderRadius: 16,
          overflow: "hidden",
          marginBottom: 16,
          textAlign: "left",
        }}
      >
        {/* Station header */}
        <div
          style={{
            background: `linear-gradient(135deg, ${chargingColor}15 0%, ${chargingColor}08 100%)`,
            borderBottom: `1.5px solid ${chargingColor}25`,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `${chargingColor}18`,
              border: `1.5px solid ${chargingColor}35`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {chargingIcon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>
              {stationName}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: chargingColor,
                marginTop: 2,
              }}
            >
              {chargingType}
            </div>
          </div>
        </div>

        {/* Info rows */}
        <div style={{ padding: "12px 16px" }}>
          <InfoRow
            icon={<Calendar size={14} color="#6b7280" />}
            label="Date"
            value={dateStr}
          />
          <InfoRow
            icon={<Clock size={14} color="#6b7280" />}
            label="Time"
            value={timeStr}
          />
          <InfoRow
            icon={<span style={{ fontSize: 13 }}>🚗</span>}
            label="Vehicle"
            value={vehiclePlate || "—"}
          />
          <InfoRow
            icon={<Zap size={14} color="#6b7280" />}
            label="Duration"
            value={`~${estimatedDurationMinutes} min`}
            isLast
          />
        </div>
      </motion.div>

      {/* Estimated time highlight */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        style={{
          background: "#1a73e8",
          borderRadius: 14,
          padding: "14px 18px",
          marginBottom: 18,
          color: "#fff",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>
          ESTIMATED CHARGING TIME
        </div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>
          ~{estimatedDurationMinutes} minutes
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
          to reach 100% charge
        </div>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <button
          type="button"
          data-ocid="booking.view_my_bookings_button"
          onClick={onViewMyBookings}
          style={{
            background: "#f0fdf4",
            color: "#16a34a",
            border: "1.5px solid #86efac",
            borderRadius: 12,
            padding: "13px",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: FONT,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <BookOpen size={16} />
          View My Bookings
        </button>

        <button
          type="button"
          data-ocid="booking.back_to_map_button"
          onClick={onBackToMap}
          style={{
            background: "#f3f4f6",
            color: "#374151",
            border: "none",
            borderRadius: 12,
            padding: "13px",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: FONT,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <ArrowLeft size={16} />
          Back to Map
        </button>
      </motion.div>
    </motion.div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingBottom: isLast ? 0 : 10,
        marginBottom: isLast ? 0 : 10,
        borderBottom: isLast ? "none" : "1px solid #f3f4f6",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>
          {label.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1f2937",
            marginTop: 1,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

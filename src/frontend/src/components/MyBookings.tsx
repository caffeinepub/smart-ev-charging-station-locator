import {
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  LogIn,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import type { Booking, BookingStatus } from "../backend";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useCancelBooking, useGetMyBookings } from "../hooks/useQueries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface MyBookingsProps {
  open: boolean;
  onClose: () => void;
  stationNameMap: Map<string, string>;
}

const FONT = "Sora, system-ui, sans-serif";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "#d97706", bg: "#fef3c7" },
  confirmed: { label: "Confirmed", color: "#16a34a", bg: "#dcfce7" },
  completed: { label: "Completed", color: "#6b7280", bg: "#f3f4f6" },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2" },
};

const CHARGING_COLORS: Record<string, string> = {
  "Fast Charging": "#f59e0b",
  "Slow Charging": "#22c55e",
  "Battery Swapping": "#3b82f6",
};

function formatDateTime(nsTimestamp: bigint): { date: string; time: string } {
  const date = new Date(Number(nsTimestamp / 1_000_000n));
  return {
    date: date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

function isCancellable(status: BookingStatus, scheduledTime: bigint): boolean {
  const statusStr = String(status);
  if (statusStr === "cancelled" || statusStr === "completed") return false;
  const scheduledMs = Number(scheduledTime / 1_000_000n);
  return scheduledMs > Date.now();
}

export function MyBookings({ open, onClose, stationNameMap }: MyBookingsProps) {
  const { identity, login, isLoggingIn, isInitializing } =
    useInternetIdentity();
  const isLoggedIn = !!identity;

  const {
    data: bookings = [],
    isLoading,
    refetch,
    isRefetching,
  } = useGetMyBookings();
  const cancelBooking = useCancelBooking();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelBooking, setConfirmCancelBooking] =
    useState<Booking | null>(null);

  const handleCancelRequest = (booking: Booking) => {
    setConfirmCancelBooking(booking);
  };

  const handleConfirmCancel = async () => {
    if (!confirmCancelBooking) return;
    const booking = confirmCancelBooking;
    setConfirmCancelBooking(null);
    const idStr = booking.bookingId.toString();
    setCancellingId(idStr);
    try {
      await cancelBooking.mutateAsync(booking.bookingId);
      toast.success("Booking cancelled successfully");
    } catch {
      toast.error("Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  };

  // Sort: upcoming first, then by scheduled time
  const sortedBookings = [...bookings].sort((a, b) => {
    const aTime = Number(a.scheduledTime);
    const bTime = Number(b.scheduledTime);
    return bTime - aTime; // newest first
  });

  const confirmBookingInfo = confirmCancelBooking
    ? formatDateTime(confirmCancelBooking.scheduledTime)
    : null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                zIndex: 800,
              }}
            />

            {/* Panel — slides from LEFT like Google Maps */}
            <motion.div
              data-ocid="my_bookings.panel"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                width: "min(420px, 100vw)",
                background: "#fff",
                zIndex: 900,
                boxShadow: "8px 0 40px rgba(32,33,36,0.18)",
                display: "flex",
                flexDirection: "column",
                fontFamily: FONT,
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "20px 20px 16px",
                  borderBottom: "1.5px solid #f3f4f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: "#e8f5e9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BookOpen size={18} color="#16a34a" />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: "#1f2937",
                      }}
                    >
                      My Bookings
                    </div>
                    {!isLoading && bookings.length > 0 && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {bookings.length} booking
                        {bookings.length !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    disabled={isRefetching}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#9ca3af",
                      padding: 6,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Refresh"
                  >
                    <RefreshCw
                      size={16}
                      style={
                        isRefetching
                          ? { animation: "spin 0.8s linear infinite" }
                          : undefined
                      }
                    />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
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
              </div>

              {/* Content */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px 16px 24px",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {/* Not logged in */}
                {!isLoggedIn && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                    }}
                  >
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#1f2937",
                        marginBottom: 6,
                      }}
                    >
                      Sign in to view bookings
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#6b7280",
                        marginBottom: 20,
                      }}
                    >
                      Your booking history will appear here after login
                    </div>
                    <button
                      type="button"
                      onClick={login}
                      disabled={isLoggingIn || isInitializing}
                      style={{
                        background: "#1a73e8",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        padding: "12px 24px",
                        cursor: isLoggingIn ? "not-allowed" : "pointer",
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: FONT,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        opacity: isLoggingIn ? 0.7 : 1,
                      }}
                    >
                      {isLoggingIn ? (
                        <Loader2
                          size={16}
                          style={{ animation: "spin 0.8s linear infinite" }}
                        />
                      ) : (
                        <LogIn size={16} />
                      )}
                      {isLoggingIn ? "Signing in..." : "Sign In"}
                    </button>
                  </motion.div>
                )}

                {/* Loading */}
                {isLoggedIn && isLoading && (
                  <div
                    data-ocid="my_bookings.loading_state"
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "#9ca3af",
                      fontSize: 13,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Loader2
                      size={24}
                      style={{ animation: "spin 0.8s linear infinite" }}
                    />
                    Loading your bookings…
                  </div>
                )}

                {/* Empty state */}
                {isLoggedIn && !isLoading && sortedBookings.length === 0 && (
                  <motion.div
                    data-ocid="my_bookings.empty_state"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      textAlign: "center",
                      padding: "40px 20px",
                    }}
                  >
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#1f2937",
                        marginBottom: 6,
                      }}
                    >
                      No bookings yet
                    </div>
                    <div style={{ fontSize: 13, color: "#9ca3af" }}>
                      Book a slot at any nearby EV station to get started
                    </div>
                  </motion.div>
                )}

                {/* Bookings list */}
                {isLoggedIn && !isLoading && sortedBookings.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {sortedBookings.map((booking: Booking, index: number) => (
                      <BookingCard
                        key={booking.bookingId.toString()}
                        booking={booking}
                        stationName={
                          stationNameMap.get(booking.stationId.toString()) ??
                          `Station #${booking.stationId}`
                        }
                        isCancelling={
                          cancellingId === booking.bookingId.toString()
                        }
                        ocidIndex={index + 1}
                        onCancelRequest={handleCancelRequest}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation dialog — rendered outside the AnimatePresence panel */}
      <AlertDialog
        open={!!confirmCancelBooking}
        onOpenChange={(open) => {
          if (!open) setConfirmCancelBooking(null);
        }}
      >
        <AlertDialogContent data-ocid="my_bookings.cancel.dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCancelBooking && confirmBookingInfo && (
                <>
                  Your slot on <strong>{confirmBookingInfo.date}</strong> at{" "}
                  <strong>{confirmBookingInfo.time}</strong> will be released
                  and cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="my_bookings.cancel.dialog.cancel_button">
              Keep Booking
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="my_bookings.cancel.dialog.confirm_button"
              onClick={() => void handleConfirmCancel()}
              style={{ background: "#dc2626" }}
            >
              Yes, Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({
  booking,
  stationName,
  isCancelling,
  ocidIndex,
  onCancelRequest,
}: {
  booking: Booking;
  stationName: string;
  isCancelling: boolean;
  ocidIndex: number;
  onCancelRequest: (booking: Booking) => void;
}) {
  const statusStr = String(booking.status);
  const statusCfg = STATUS_CONFIG[statusStr] ?? {
    label: statusStr,
    color: "#6b7280",
    bg: "#f3f4f6",
  };
  const chargingColor = CHARGING_COLORS[booking.chargingType] ?? "#1a73e8";
  const { date, time } = formatDateTime(booking.scheduledTime);
  const cancellable = isCancellable(booking.status, booking.scheduledTime);

  return (
    <motion.div
      data-ocid={`my_bookings.item.${ocidIndex}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#fff",
        border: "1.5px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "12px 14px",
          background: `${chargingColor}08`,
          borderBottom: `1.5px solid ${chargingColor}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#1f2937",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {stationName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: chargingColor,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {booking.chargingType}
          </div>
        </div>
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 9999,
            background: statusCfg.bg,
            color: statusCfg.color,
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* Card body */}
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Calendar size={13} color="#9ca3af" />
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>
            {date}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} color="#9ca3af" />
          <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>
            {time}
          </span>
        </div>
        {booking.vehiclePlate && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11 }}>🚗</span>
            <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>
              {booking.vehiclePlate}
            </span>
          </div>
        )}
      </div>

      {/* Booking ID + cancel */}
      <div
        style={{
          padding: "8px 14px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {statusStr === "confirmed" ? (
            <CheckCircle size={13} color="#16a34a" />
          ) : statusStr === "cancelled" ? (
            <XCircle size={13} color="#dc2626" />
          ) : null}
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
            ID #{booking.bookingId.toString()} · ~
            {booking.estimatedDurationMinutes.toString()} min
          </span>
        </div>

        {cancellable && (
          <button
            type="button"
            data-ocid={`my_bookings.cancel_button.${ocidIndex}`}
            disabled={isCancelling}
            onClick={() => onCancelRequest(booking)}
            style={{
              background: isCancelling ? "#f3f4f6" : "#fee2e2",
              color: isCancelling ? "#9ca3af" : "#dc2626",
              border: `1px solid ${isCancelling ? "#e5e7eb" : "#fecaca"}`,
              borderRadius: 8,
              padding: "5px 10px",
              cursor: isCancelling ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: FONT,
              display: "flex",
              alignItems: "center",
              gap: 5,
              transition: "all 0.15s",
            }}
          >
            {isCancelling ? (
              <Loader2
                size={12}
                style={{ animation: "spin 0.8s linear infinite" }}
              />
            ) : (
              <X size={12} />
            )}
            {isCancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

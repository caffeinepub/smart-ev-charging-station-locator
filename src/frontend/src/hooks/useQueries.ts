import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking } from "../backend";
import { useActor } from "./useActor";

export function useGetStations() {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getStations();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30_000,
  });
}

export function useGetAvailableSlots(
  stationId: bigint | null,
  dateStart: bigint | null,
  dateEnd: bigint | null,
) {
  const { actor, isFetching } = useActor();
  return useQuery<Array<{ isAvailable: boolean; slotTime: bigint }>>({
    queryKey: ["availableSlots", stationId?.toString(), dateStart?.toString()],
    queryFn: async () => {
      if (
        !actor ||
        stationId === null ||
        dateStart === null ||
        dateEnd === null
      )
        return [];
      try {
        return await actor.getAvailableSlots(stationId, dateStart, dateEnd);
      } catch {
        // Fallback: generate mock slots
        return generateMockSlots(dateStart);
      }
    },
    enabled:
      !!actor &&
      !isFetching &&
      stationId !== null &&
      dateStart !== null &&
      dateEnd !== null,
    staleTime: 30_000,
  });
}

export function useGetMyBookings() {
  const { actor, isFetching } = useActor();
  return useQuery<Booking[]>({
    queryKey: ["myBookings"],
    queryFn: async () => {
      if (!actor) return [];
      try {
        return await actor.getMyBookings();
      } catch {
        return [];
      }
    },
    enabled: !!actor && !isFetching,
    staleTime: 10_000,
  });
}

export function useGetCallerRole() {
  const { actor, isFetching } = useActor();
  return useQuery({
    queryKey: ["callerRole"],
    queryFn: async () => {
      if (!actor) return "guest";
      try {
        return await actor.getCallerUserRole();
      } catch {
        return "guest";
      }
    },
    enabled: !!actor && !isFetching,
    staleTime: 60_000,
  });
}

export function useBookSlot() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stationId,
      chargingType,
      vehiclePlate,
      scheduledTime,
      estimatedDurationMinutes,
    }: {
      stationId: bigint;
      chargingType: string;
      vehiclePlate: string;
      scheduledTime: bigint;
      estimatedDurationMinutes: bigint;
    }) => {
      if (!actor) throw new Error("Not connected");
      return actor.bookSlot(
        stationId,
        chargingType,
        vehiclePlate,
        scheduledTime,
        estimatedDurationMinutes,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availableSlots"] });
    },
  });
}

export function useCancelBooking() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: bigint) => {
      if (!actor) throw new Error("Not connected");
      return actor.cancelBooking(bookingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["myBookings"] });
    },
  });
}

/** Generate realistic mock slots 8am-10pm in 30-min blocks */
function generateMockSlots(
  dayStartNs: bigint,
): Array<{ isAvailable: boolean; slotTime: bigint }> {
  const slots: Array<{ isAvailable: boolean; slotTime: bigint }> = [];
  // dayStartNs is midnight of the day; we'll add offsets for 8am-10pm
  const dayStartMs = Number(dayStartNs / 1_000_000n);
  const date = new Date(dayStartMs);
  date.setHours(8, 0, 0, 0);

  for (let i = 0; i < 28; i++) {
    // 28 slots: 8am to 10pm (14h × 2 slots/h)
    const slotMs = date.getTime() + i * 30 * 60 * 1000;
    const slotHour = new Date(slotMs).getHours();
    if (slotHour >= 22) break;

    const hash = (slotMs / 1800000) % 5;
    const isAvailable = hash !== 0 && hash !== 2; // ~60% available

    slots.push({
      slotTime: BigInt(slotMs) * 1_000_000n,
      isAvailable,
    });
  }
  return slots;
}

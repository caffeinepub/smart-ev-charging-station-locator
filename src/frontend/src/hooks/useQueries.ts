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
  const { actor } = useActor();
  return useQuery<Array<{ isAvailable: boolean; slotTime: bigint }>>({
    queryKey: ["availableSlots", stationId?.toString(), dateStart?.toString()],
    queryFn: async () => {
      if (dateStart === null) return [];
      // Always generate local slots immediately so the UI is never empty
      const localSlots = generateMockSlots(dateStart);
      if (!actor || stationId === null || dateEnd === null) return localSlots;
      try {
        const backendSlots = await actor.getAvailableSlots(
          stationId,
          dateStart,
          dateEnd,
        );
        // If backend returns slots, use them; otherwise fall back to local
        return backendSlots.length > 0 ? backendSlots : localSlots;
      } catch {
        return localSlots;
      }
    },
    // Run even without actor so local slots always display
    enabled: dateStart !== null,
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
  // dayStartNs is midnight nanoseconds of the selected day
  const dayStartMs = Number(dayStartNs / 1_000_000n);

  // Build 8am start for the selected day
  const dayDate = new Date(dayStartMs);
  dayDate.setHours(8, 0, 0, 0);
  const slotStartMs = dayDate.getTime();

  // Total slots: 8am → 10pm = 14 hours = 28 half-hour slots
  for (let i = 0; i < 28; i++) {
    const slotMs = slotStartMs + i * 30 * 60 * 1000;
    const slotDate = new Date(slotMs);
    // Stop at or after 10pm
    if (slotDate.getHours() >= 22) break;

    // Deterministic availability based on slot time — ~60% available
    const hash = Math.floor(slotMs / 1_800_000) % 5;
    const isAvailable = hash !== 0 && hash !== 2;

    slots.push({
      slotTime: BigInt(slotMs) * 1_000_000n,
      isAvailable,
    });
  }
  return slots;
}

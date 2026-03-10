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
      // Always show local slots immediately so UI is never empty
      const localSlots = generateAllSlots(dateStart);
      if (!actor || stationId === null || dateEnd === null) return localSlots;
      try {
        const backendSlots = await actor.getAvailableSlots(
          stationId,
          dateStart,
          dateEnd,
        );
        // Backend returns real booking status — prefer it if we got results
        return backendSlots.length > 0
          ? (backendSlots as Array<{ isAvailable: boolean; slotTime: bigint }>)
          : localSlots;
      } catch {
        return localSlots;
      }
    },
    enabled: dateStart !== null,
    // Short stale time so booking by User 1 shows up quickly for User 2
    staleTime: 5_000,
    refetchInterval: 15_000,
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
      void queryClient.invalidateQueries({ queryKey: ["availableSlots"] });
    },
  });
}

/**
 * Generate all slots from 8am to 10pm (28 half-hour slots).
 * All slots are marked available by default — real availability
 * comes from the backend once connected.
 */
export function generateAllSlots(
  dayStart8amNs: bigint,
): Array<{ isAvailable: boolean; slotTime: bigint }> {
  const slots: Array<{ isAvailable: boolean; slotTime: bigint }> = [];
  const startMs = Number(dayStart8amNs / 1_000_000n);

  // 8am → 10pm = 28 half-hour slots
  for (let i = 0; i < 28; i++) {
    const slotMs = startMs + i * 30 * 60 * 1000;
    const slotDate = new Date(slotMs);
    if (slotDate.getHours() >= 22) break;
    slots.push({
      slotTime: BigInt(slotMs) * 1_000_000n,
      isAvailable: true, // all available until backend says otherwise
    });
  }
  return slots;
}

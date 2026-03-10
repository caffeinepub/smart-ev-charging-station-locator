import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking } from "../backend";
import { createActorWithConfig } from "../config";
import { getSecretParameter } from "../utils/urlParams";
import { useActor } from "./useActor";
import { useInternetIdentity } from "./useInternetIdentity";

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
      const localSlots = generateAllSlots(dateStart);
      if (!actor || stationId === null || dateEnd === null) return localSlots;
      try {
        const backendSlots = await actor.getAvailableSlots(
          stationId,
          dateStart,
          dateEnd,
        );
        return backendSlots.length > 0
          ? (backendSlots as Array<{ isAvailable: boolean; slotTime: bigint }>)
          : localSlots;
      } catch {
        return localSlots;
      }
    },
    enabled: dateStart !== null,
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

/**
 * Creates a fresh authenticated actor from the current identity.
 * Used as fallback when the cached actor hasn't initialized yet.
 */
async function createFreshActor(
  identity: import("@icp-sdk/core/agent").Identity,
) {
  const actor = await createActorWithConfig({ agentOptions: { identity } });
  const adminToken = getSecretParameter("caffeineAdminToken") ?? "";
  await actor._initializeAccessControlWithSecret(adminToken);
  return actor;
}

export function useBookSlot() {
  const { actor } = useActor();
  const { identity } = useInternetIdentity();
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
      // Use cached actor if ready; otherwise build a fresh one from identity
      const activeActor =
        actor ?? (identity ? await createFreshActor(identity) : null);
      if (!activeActor) throw new Error("Please log in to book a slot");
      return activeActor.bookSlot(
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
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: bigint) => {
      const activeActor =
        actor ?? (identity ? await createFreshActor(identity) : null);
      if (!activeActor) throw new Error("Please log in to cancel a booking");
      return activeActor.cancelBooking(bookingId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availableSlots"] });
    },
  });
}

/**
 * Generate all slots from 8am to 10pm (28 half-hour slots).
 */
export function generateAllSlots(
  dayStart8amNs: bigint,
): Array<{ isAvailable: boolean; slotTime: bigint }> {
  const slots: Array<{ isAvailable: boolean; slotTime: bigint }> = [];
  const startMs = Number(dayStart8amNs / 1_000_000n);
  for (let i = 0; i < 28; i++) {
    const slotMs = startMs + i * 30 * 60 * 1000;
    const slotDate = new Date(slotMs);
    if (slotDate.getHours() >= 22) break;
    slots.push({
      slotTime: BigInt(slotMs) * 1_000_000n,
      isAvailable: true,
    });
  }
  return slots;
}

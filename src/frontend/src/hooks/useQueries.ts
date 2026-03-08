import { useQuery } from "@tanstack/react-query";
import type { Station } from "../backend";
import { useActor } from "./useActor";

export function useGetStations() {
  const { actor, isFetching } = useActor();
  return useQuery<Station[]>({
    queryKey: ["stations"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getStations();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30_000,
  });
}

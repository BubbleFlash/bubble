import { useQuery } from "@tanstack/react-query";
import type { GameLink } from "@commune/shared";
import { api } from "./api";

export const gameCatalogKey = ["games"] as const;

export function useGameCatalog() {
  return useQuery({
    queryKey: gameCatalogKey,
    queryFn: ({ signal }) => api<{ items: GameLink[] }>("/games", { signal }),
  });
}

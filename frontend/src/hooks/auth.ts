import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: async () => unwrap(await api.GET("/api/me")) });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/api/auth/sign-out");
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

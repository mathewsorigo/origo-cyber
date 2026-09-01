import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to Postgres changes on the given tables and invalidates the
 * provided react-query keys, so every screen refreshes itself automatically
 * whenever the Hermes agent or another user changes data.
 */
export function useRealtimeSync(
  channelName: string,
  tables: string[],
  queryKeys: QueryKey[],
) {
  const queryClient = useQueryClient();
  const tablesKey = tables.join(",");
  const keysKey = JSON.stringify(queryKeys);

  useEffect(() => {
    const list = tablesKey.split(",").filter(Boolean);
    const keys: QueryKey[] = JSON.parse(keysKey);
    let channel = supabase.channel(`${channelName}-${Math.random().toString(36).slice(2, 8)}`);

    for (const table of list) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        },
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, tablesKey, keysKey, queryClient]);
}

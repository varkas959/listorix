import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useListStore } from '../store/useListStore';
import { useAuthStore } from '../store/useAuthStore';
import type { GroceryItem } from '../types';

interface DbItemPayload {
  id:         string;
  list_id:    string;
  user_id:    string;
  name:       string;
  qty:        string;
  count:      number;
  price:      number;
  category:   string;
  checked:    boolean;
  created_at: string;
}

function toGroceryItem(row: DbItemPayload): GroceryItem {
  return {
    id:        row.id,
    remoteId:  row.id,
    name:      row.name,
    qty:       row.qty,
    count:     row.count ?? 1,
    price:     row.price,
    category:  row.category,
    checked:   row.checked,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/**
 * Subscribes to real-time item changes for the given listId.
 * Applies remote inserts / updates / deletes directly to the store.
 * Skips changes made by the current user (echo prevention).
 * Cleans up subscription when listId changes or component unmounts.
 */
export function useRealtimeItems(listId: string | null) {
  const { user }   = useAuthStore();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!listId || !user) return;

    const channel = supabase
      .channel(`items:${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` },
        (payload) => {
          // Ignore own changes — they're already applied optimistically
          const row = (payload.new ?? payload.old) as DbItemPayload;
          if (row?.user_id === user.id) return;

          const store = useListStore.getState();

          if (payload.eventType === 'INSERT') {
            const newItem = toGroceryItem(row);
            const exists  = store.items.some(i => i.id === newItem.id);
            if (!exists) {
              // Direct state patch — do NOT call store.addItem() which would re-sync to remote
              useListStore.setState({ items: [...store.items, newItem] });
              // Show notification dot if user is currently on personal context
              if (store.activeContext === 'personal') {
                useListStore.setState({ groupNotification: true });
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = toGroceryItem(row);
            const items   = store.items.map(i =>
              i.id === updated.id ? { ...i, ...updated } : i
            );
            // Direct state patch — bypass remote sync (already came FROM remote)
            useListStore.setState({ items });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as DbItemPayload)?.id;
            if (deletedId) {
              const items = store.items.filter(i => i.id !== deletedId);
              useListStore.setState({ items });
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [listId, user?.id]);
}

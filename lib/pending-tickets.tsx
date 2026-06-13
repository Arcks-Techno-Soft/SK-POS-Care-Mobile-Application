/**
 * Drives the badges on the Tickets and Installs tabs.
 *
 * Meaning depends on role:
 *   - ENGINEER: tickets/installations assigned to ME that I haven't accepted /
 *     actioned yet (status ASSIGNED) — i.e. "waiting on me".
 *   - OWNER / MANAGER: tickets/installations NOT assigned to anyone yet — i.e.
 *     "needs assignment". For tickets that's OPEN + ACKNOWLEDGED; for
 *     installations that's NEW.
 *
 * Counts refresh when: the user logs in, the app returns to the foreground, a
 * push notification arrives, after a workflow action via refresh(), and on a
 * light interval as a backstop. Best-effort — transient failures keep the last
 * known counts.
 */
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth';

interface PendingCounts {
  ticketCount: number;
  installCount: number;
  refresh: () => void;
}

const Ctx = createContext<PendingCounts>({
  ticketCount: 0,
  installCount: 0,
  refresh: () => {},
});

const POLL_MS = 60_000;

export function PendingTicketsProvider({ children }: { children: ReactNode }) {
  const { api, user, status } = useAuth();
  const [ticketCount, setTicketCount] = useState(0);
  const [installCount, setInstallCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || status !== 'authenticated') {
      setTicketCount(0);
      setInstallCount(0);
      return;
    }
    const isEngineer = user.role === 'ENGINEER';
    try {
      if (isEngineer) {
        // Assigned to me, awaiting my acceptance/action. The list endpoints
        // already scope engineers to their own rows, so `total` is exact.
        const [t, i] = await Promise.all([
          api.listTickets({ status: 'ASSIGNED', limit: 1 }),
          api.listInstallations({ status: 'ASSIGNED', limit: 1 }),
        ]);
        setTicketCount(t.total);
        setInstallCount(i.total);
      } else {
        // Owner / Manager: unassigned items that still need an engineer.
        const [open, ack, instNew] = await Promise.all([
          api.listTickets({ status: 'OPEN', limit: 1 }),
          api.listTickets({ status: 'ACKNOWLEDGED', limit: 1 }),
          api.listInstallations({ status: 'NEW', limit: 1 }),
        ]);
        setTicketCount(open.total + ack.total);
        setInstallCount(instNew.total);
      }
    } catch {
      // best-effort — keep previous counts
    }
  }, [api, user, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const recv = Notifications.addNotificationReceivedListener(() => refresh());
    const resp = Notifications.addNotificationResponseReceivedListener(() => refresh());
    return () => {
      recv.remove();
      resp.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, status]);

  return (
    <Ctx.Provider value={{ ticketCount, installCount, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePendingTickets(): PendingCounts {
  return useContext(Ctx);
}

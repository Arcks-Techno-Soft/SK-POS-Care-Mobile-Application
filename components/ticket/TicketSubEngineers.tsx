/** Field sub-engineers on a ticket — thin wrapper over the shared section. */

import SubEngineersSection, {
  type SubEngineerOps,
} from '@/components/shared/SubEngineersSection';
import { useApi } from '@/lib/auth';
import { ticketIsOperable, ticketLockReason } from '@/lib/options';
import type { TicketDetail } from '@/lib/types';

interface Props {
  reference: string;
  ticket: TicketDetail;
  reload: () => void;
}

export default function TicketSubEngineers({ reference, ticket }: Props) {
  const api = useApi();
  const ops: SubEngineerOps = {
    list: (ref) => api.listSubEngineers(ref),
    suggest: (ref) => api.subEngineerSuggestions(ref),
    add: (ref, body) => api.addSubEngineer(ref, body),
    updateFee: (ref, id, fee) => api.updateSubEngineerFee(ref, id, fee),
    remove: (ref, id) => api.removeSubEngineer(ref, id),
  };

  return (
    <SubEngineersSection
      reference={reference}
      ops={ops}
      operable={ticketIsOperable(ticket.status, ticket.on_hold)}
      lockReason={ticketLockReason(ticket.status, ticket.on_hold)}
      entityLabel="ticket"
    />
  );
}

/** Field sub-engineers on an installation — thin wrapper over the shared
 *  section. Uses the same district roster as tickets, so a contact added on
 *  either side is reusable on the other. */

import SubEngineersSection, {
  type SubEngineerOps,
} from '@/components/shared/SubEngineersSection';
import { useApi } from '@/lib/auth';
import type { InstallationDetail } from '@/lib/types';

interface Props {
  reference: string;
  installation: InstallationDetail;
}

export default function InstallationSubEngineers({ reference, installation }: Props) {
  const api = useApi();
  const ops: SubEngineerOps = {
    list: (ref) => api.listInstallationSubEngineers(ref),
    suggest: (ref) => api.installationSubEngineerSuggestions(ref),
    add: (ref, body) => api.addInstallationSubEngineer(ref, body),
    updateFee: (ref, id, fee) => api.updateInstallationSubEngineerFee(ref, id, fee),
    remove: (ref, id) => api.removeInstallationSubEngineer(ref, id),
  };

  // Editable until the installation closes. Fees stay editable to the end
  // because the figure is often known only after the work is done.
  const operable = installation.status !== 'CLOSED';

  return (
    <SubEngineersSection
      reference={reference}
      ops={ops}
      operable={operable}
      lockReason="This installation is closed — no further changes."
      entityLabel="installation"
    />
  );
}

// Projects & Contracts module entry (Services profile, FR-SRV-001..007).
// Sub-routes: overview · catalog · contracts · projects · resources · timesheets ·
// expenses · milestones · billing · retainers · revenue · profitability · settings
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { useProjectsNav } from '../subnav';
import { nav } from '../../store';
import Overview from './Overview';
import Catalog from './Catalog';
import ContractRegister from './contracts/Register';
import ContractForm from './contracts/Form';
import ContractDetail from './contracts/Detail';
import ProjectRegister from './projects/Register';
import ProjectForm from './projects/Form';
import ProjectDetail from './projects/Detail';
import Resources from './Resources';
import TimesheetRegister from './timesheets/Register';
import TimesheetPage from './timesheets/Sheet';
import Expenses from './Expenses';
import Milestones from './Milestones';
import Billing from './BillingRuns';
import Retainers from './Retainers';
import Revenue from './RevenueRecognition';
import Profitability from './Profitability';
import Settings from './Settings';

export default function Module({ route }: ModuleProps) {
  const { id, params } = route;
  const edit = params.edit === '1';
  const items = useProjectsNav();
  return (
    <ModuleShell module="projects" title="Projects & Contracts" items={items} defaultSub="overview">
      {(sub) => {
        switch (sub) {
          case 'overview': return <Overview />;
          case 'catalog': return <Catalog editId={id || undefined} />;
          case 'contracts':
            if (id === 'new') return <ContractForm key={`new-${params.customer ?? ''}-${params.project ?? ''}`} customerId={params.customer} projectId={params.project} method={params.method} />;
            if (id && edit) return <ContractForm key={id} id={id} />;
            if (id) return <ContractDetail key={id} id={id} tab={params.tab} onTab={(t) => nav.replace(`projects/contracts/${id}?tab=${t}`)} />;
            return <ContractRegister tab={params.tab} />;
          case 'projects':
            if (id === 'new') return <ProjectForm key={`new-${params.customer ?? ''}-${params.contract ?? ''}`} customerId={params.customer} contractId={params.contract} />;
            if (id && edit) return <ProjectForm key={id} id={id} />;
            if (id) return <ProjectDetail key={id} id={id} tab={params.tab} onTab={(t) => nav.replace(`projects/projects/${id}?tab=${t}`)} />;
            return <ProjectRegister />;
          case 'resources': return <Resources tab={params.tab} />;
          case 'timesheets':
            if (id === 'new') return <TimesheetPage key={`new-${params.employee ?? ''}-${params.week ?? ''}`} employeeId={params.employee} week={params.week} />;
            if (id) return <TimesheetPage key={id} id={id} />;
            return <TimesheetRegister tab={params.tab} employeeId={params.employee} projectId={params.project} />;
          case 'expenses': return <Expenses />;
          case 'milestones': return <Milestones tab={params.tab} contractId={params.contract} />;
          case 'billing':
            return <Billing runId={id || undefined} period={params.period} />;
          case 'retainers': return <Retainers id={id || undefined} customerId={params.customer} />;
          case 'revenue': return <Revenue contractId={params.contract} period={params.period} />;
          case 'profitability': return <Profitability projectId={params.project} />;
          case 'settings': return <Settings />;
          default: return <Overview />;
        }
      }}
    </ModuleShell>
  );
}

// Company Administration module (design §7.21): ModuleShell sub-nav → 18 sub-pages, each permission-gated.
import type { ModuleProps } from '../registry';
import { useSession } from '../../store';
import { ModuleShell } from '../../components/ui';
import type { SubNavItem } from '../../components/ui';
import { Gate } from './shared';
import CompanyProfile from './CompanyProfile';
import Companies from './Companies';
import Branches from './Branches';
import Periods from './Periods';
import Defaults from './Defaults';
import Users from './Users';
import UserDetail from './UserDetail';
import Roles from './Roles';
import Numbering from './Numbering';
import Workflows from './Workflows';
import Templates from './Templates';
import BusinessProfile from './BusinessProfile';
import Localization from './Localization';
import PlanUsage from './Plan';
import AuditLog from './AuditLog';
import Integrations from './Integrations';
import Jobs from './Jobs';
import Notifications from './Notifications';
import DataDemo from './DataDemo';

const PERMS: Record<string, string> = {
  company: 'admin.company.view', companies: 'admin.company.view', branches: 'admin.branches.view', periods: 'admin.periods.view', defaults: 'admin.company.view',
  users: 'admin.users.view', roles: 'admin.roles.view', numbering: 'admin.numbering.view', workflows: 'admin.workflows.view', templates: 'admin.templates.view',
  profile: 'admin.company.view', localization: 'admin.company.view', plan: 'admin.company.view', audit: 'admin.audit.view', integrations: 'admin.integrations.view',
  jobs: 'admin.jobs.view', notifications: 'admin.company.view', data: 'admin.data.view',
};

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  const visible = (id: string) => s.can(PERMS[id]) || s.isTenantOwner;
  const items: SubNavItem[] = [
    { id: 'company', label: 'Company profile', group: 'Organisation', hidden: !visible('company') },
    { id: 'companies', label: 'Companies', group: 'Organisation', hidden: !s.isTenantOwner },
    { id: 'branches', label: 'Branches & locations', group: 'Organisation', hidden: !visible('branches') },
    { id: 'periods', label: 'Financial periods', group: 'Organisation', hidden: !visible('periods') },
    { id: 'defaults', label: 'Defaults', group: 'Organisation', hidden: !visible('defaults') },
    { id: 'profile', label: 'Business profile', group: 'Organisation', hidden: !visible('profile') },
    { id: 'users', label: 'Users & access', group: 'Access', hidden: !visible('users') },
    { id: 'roles', label: 'Roles & permissions', group: 'Access', hidden: !visible('roles') },
    { id: 'numbering', label: 'Number series', group: 'Documents', hidden: !visible('numbering') },
    { id: 'workflows', label: 'Workflows', group: 'Documents', hidden: !visible('workflows') },
    { id: 'templates', label: 'Document templates', group: 'Documents', hidden: !visible('templates') },
    { id: 'localization', label: 'Localization', group: 'Platform', hidden: !visible('localization') },
    { id: 'plan', label: 'Plan & usage', group: 'Platform', hidden: !s.isTenantOwner },
    { id: 'integrations', label: 'Integrations & credentials', group: 'Platform', hidden: !visible('integrations') },
    { id: 'audit', label: 'Audit log', group: 'Operations', hidden: !visible('audit') },
    { id: 'jobs', label: 'Jobs & exports', group: 'Operations', hidden: !visible('jobs') },
    { id: 'notifications', label: 'Notification settings', group: 'Operations', hidden: !visible('notifications') },
    { id: 'data', label: 'Data & demo', group: 'Operations', hidden: !visible('data') },
  ];
  return (
    <ModuleShell module="admin" title="Company administration" items={items} defaultSub={items.find((i) => !i.hidden)?.id ?? 'company'}>
      {(sub) => {
        const perm = PERMS[sub] ?? 'admin.company.view';
        const what = items.find((i) => i.id === sub)?.label ?? 'this page';
        const body = (() => {
          switch (sub) {
            case 'company': return <CompanyProfile />;
            case 'companies': return <Companies />;
            case 'branches': return <Branches />;
            case 'periods': return <Periods initialPeriod={route.params.period} />;
            case 'defaults': return <Defaults />;
            case 'profile': return <BusinessProfile />;
            case 'users': return route.id ? <UserDetail id={route.id} /> : <Users />;
            case 'roles': return <Roles id={route.id || undefined} />;
            case 'numbering': return <Numbering />;
            case 'workflows': return <Workflows />;
            case 'templates': return <Templates />;
            case 'localization': return <Localization />;
            case 'plan': return <PlanUsage />;
            case 'integrations': return <Integrations initialTab={route.params.tab} />;
            case 'audit': return <AuditLog />;
            case 'jobs': return <Jobs initialTab={route.params.tab} />;
            case 'notifications': return <Notifications />;
            case 'data': return <DataDemo />;
            default: return <CompanyProfile />;
          }
        })();
        if (sub === 'users' && route.id === s.user?.id) return body; // own profile always accessible
        return <Gate perm={perm} what={what}>{body}</Gate>;
      }}
    </ModuleShell>
  );
}

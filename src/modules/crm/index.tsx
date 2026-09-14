// CRM module entry: leads & pipeline, customer 360, activities, collections follow-up.
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { CRM_NAV } from '../subnav';
import { LeadRegister, LeadDetail } from './Leads';
import Customer360 from './Customer360';
import { ActivitiesPage } from './Activities';
import Collections from '../sales/ar/Collections';


export default function Module({ route }: ModuleProps) {
  const { id, params } = route;
  return (
    <ModuleShell module="crm" title="CRM" items={CRM_NAV} defaultSub="leads">
      {(sub) => {
        switch (sub) {
          case 'leads':
            if (id) return <LeadDetail key={id} id={id} convert={params.convert === '1'} />;
            return <LeadRegister />;
          case 'customers': return <Customer360 key={id} customerId={id || undefined} />;
          case 'activities': return <ActivitiesPage focusId={params.id} />;
          case 'collections': return <Collections customerId={params.customer} />;
          default: return <LeadRegister />;
        }
      }}
    </ModuleShell>
  );
}

import { Suspense, useEffect } from 'react';
import { session, useSession, useRoute, nav } from './store';
import AppShell from './components/AppShell';
import { ToastProvider } from './components/ui/overlays';
import { EmptyState, Button, Skeleton } from './components/ui/primitives';
import { MODULES, moduleById } from './modules/registry';
import AuthGate from './modules/auth';

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const s = useSession();
  const route = useRoute();

  useEffect(() => {
    if (s.state.auth === 'app' && (!route.path || route.path === 'home') && window.location.hash === '') nav.replace('home');
  }, [s.state.auth, route.path]);

  if (s.state.auth !== 'app') return <AuthGate />;

  const mod = moduleById(route.module) ?? moduleById('home')!;
  let body: React.ReactNode;
  if (!moduleById(route.module)) {
    body = <EmptyState icon="🧭" title="Page not found" description={`There is no module called "${route.module}".`} action={<Button variant="primary" onClick={() => nav.go('home')}>Go home</Button>} />;
  } else if (mod.platformOnly && !s.isPlatformAdmin) {
    body = <EmptyState icon="🔒" title="Platform administration is restricted" description="Only platform users can open this area." action={<Button variant="primary" onClick={() => nav.go('home')}>Go home</Button>} />;
  } else if (!s.entitled(mod.id)) {
    body = <EmptyState icon="⚡" title={`${mod.label} is not included in your plan`} description={`Your ${s.plan?.name ?? ''} plan does not include this module (ENTITLEMENT_DENIED). The tenant owner can upgrade under Company administration › Plan & usage.`} action={s.isTenantOwner ? <Button variant="tinted" onClick={() => nav.go('admin/plan')}>View plan & usage</Button> : <Button variant="secondary" onClick={() => nav.go('home')}>Go home</Button>} />;
  } else if (mod.permission && !s.canModule(mod.permission)) {
    body = <EmptyState icon="🔒" title={`You don't have access to ${mod.label}`} description="Ask your company administrator to grant access (PERMISSION_DENIED)." action={<Button variant="link" onClick={() => session.setAuth('app')}>Request access</Button>} />;
  } else {
    const Comp = mod.component;
    body = (
      <Suspense fallback={<Skeleton rows={8} />}>
        <Comp route={route} />
      </Suspense>
    );
  }

  return (
    <AppShell fullBleed={mod.fullBleed && route.sub !== 'admin' && route.sub !== 'shifts' && route.sub !== 'bills' && route.sub !== 'returns'}>
      {body}
    </AppShell>
  );
}

export { MODULES };

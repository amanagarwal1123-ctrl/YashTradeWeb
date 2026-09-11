import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function useAuthAvailability(flow) {
  const [state, setState] = useState({ available: false, checking: true, message: '' });
  const check = useCallback(async () => {
    setState(s => ({ ...s, checking: true }));
    try {
      const { data } = await api.get('/public/auth-status', { params: { website_origin: window.location.origin } });
      const result = data.flows?.[flow];
      if (!result) throw new Error('Status unavailable');
      setState({ available: result.available === true, message: result.message, checking: false });
    } catch {
      setState({ available: false, checking: false, message: 'The verification service is temporarily unavailable. Please check again shortly.' });
    }
  }, [flow]);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active && !document.hidden) check(); };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [check]);
  return { ...state, check };
}

export const AuthAvailability = ({ state, prefix }) => !state.available ? (
  <section className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2" data-testid={`${prefix}-auth-availability`} role="status">
    <p className="text-sm text-amber-950" data-testid={`${prefix}-auth-availability-message`}>
      {state.checking ? 'Checking verification service…' : state.message}
    </p>
    {!state.checking && <Button type="button" variant="outline" size="sm" onClick={state.check} data-testid={`${prefix}-auth-check-again`}>
      <RefreshCw size={14} className="mr-2" />Check again
    </Button>}
  </section>
) : null;
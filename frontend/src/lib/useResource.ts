import { useEffect, useState, useCallback } from 'react';
import { api, errorMessage } from './api';
import { schoolChangeEvent, resourceAffected, type ChangeScope } from './events';
export function useResource<T>(url: string, refreshOnSchoolChange = true) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    url: string;
    revision: number;
    data: T | null;
    error: string;
  }>({ url: '', revision: -1, data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    api<T>(url, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ url, revision, data, error: '' });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({ url, revision, data: null, error: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [url, revision]);
  const current = state.url === url && state.revision === revision;
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!refreshOnSchoolChange) return;
    const changed = (event: Event) => {
      const scope = (event as CustomEvent<{ scope: ChangeScope }>).detail?.scope ?? 'all';
      if (resourceAffected(url, scope)) reload();
    };
    window.addEventListener(schoolChangeEvent, changed);
    return () => window.removeEventListener(schoolChangeEvent, changed);
  }, [url, reload, refreshOnSchoolChange]);
  return {
    previousData: state.data,
    data: current ? state.data : null,
    error: current ? state.error : '',
    loading: !current,
    reload,
  };
}

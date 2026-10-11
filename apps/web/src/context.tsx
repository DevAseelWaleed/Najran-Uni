import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, ApiError } from './api';
type Context = {
  user: any;
  brand: any;
  loading: boolean;
  error: any;
  can: (p: string) => boolean;
  refresh: () => Promise<any>;
};
const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function AppProvider({ children }: React.PropsWithChildren) {
  const cache = useQueryClient();
  const lastUser = useRef<string | null>(null);
  const auth = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const user = await api('/auth/me');
        setCsrf(user.csrf);
        return user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setCsrf('');
          return null;
        }
        throw e;
      }
    },
    retry: false,
    staleTime: 60000,
  });
  const brand = useQuery({
    queryKey: ['branding'],
    queryFn: () => api('/branding'),
    staleTime: 300000,
  });
  useEffect(() => {
    if (brand.data?.primaryColor)
      document.documentElement.style.setProperty('--primary', brand.data.primaryColor);
    if (brand.data?.accentColor) document.documentElement.style.setProperty('--gold', brand.data.accentColor);
    if (brand.data?.systemName) document.title = brand.data.systemName;
  }, [brand.data?.primaryColor, brand.data?.accentColor, brand.data?.systemName]);
  useEffect(() => {
    const id = auth.data?.id || null;
    if (lastUser.current !== id) {
      cache.removeQueries({
        predicate: (q) => !['me', 'branding'].includes(String(q.queryKey[0])),
      });
      lastUser.current = id;
    }
  }, [auth.data?.id, cache]);
  useEffect(() => {
    function expired() {
      setCsrf('');
      cache.setQueryData(['me'], null);
    }
    window.addEventListener('portal-session-expired', expired);
    return () => window.removeEventListener('portal-session-expired', expired);
  }, [cache]);
  return (
    <AppContext.Provider
      value={{
        user: auth.data,
        brand: brand.data,
        loading: auth.isPending,
        error: auth.error,
        can: (p) => auth.data?.permissions.includes(p) || false,
        refresh: auth.refetch,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

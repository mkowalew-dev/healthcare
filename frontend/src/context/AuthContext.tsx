import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../services/api';
import { User, Patient, Provider, AuthContextType } from '../types';
import { identifyUser, clearIdentity, trackEvent } from '../analytics';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Patient | Provider | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('cc_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('cc_token');
    if (savedToken) {
      authApi.me()
        .then((res) => {
          setUser(res.data.user);
          setProfile(res.data.profile);
          identifyUser(res.data.user);
        })
        .catch(() => {
          localStorage.removeItem('cc_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setProfile(null);
      setToken(null);
    };
    window.addEventListener('cc:session-expired', handleSessionExpired);
    return () => window.removeEventListener('cc:session-expired', handleSessionExpired);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await authApi.login(email, password);
    const { token: newToken, user: newUser, profile: newProfile } = res.data;
    localStorage.setItem('cc_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setProfile(newProfile);
    identifyUser(newUser);
    trackEvent('user.login', { 'enduser.role': newUser.role });
    return newUser;
  };

  const logout = () => {
    trackEvent('user.logout');
    clearIdentity();
    localStorage.removeItem('cc_token');
    setToken(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

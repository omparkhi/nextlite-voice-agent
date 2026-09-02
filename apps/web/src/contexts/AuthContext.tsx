import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setAccessToken } from '../services/api';

interface AuthContextType {
  user: any | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  const refreshUser = async () => {
    try {
      const response = await api.refresh();
      setAccessToken(response.accessToken);
      
      // Decode token to get user info
      const payload = JSON.parse(atob(response.accessToken.split('.')[1]));
      setUser(payload);
    } catch {
      setAccessToken(null);
      setUser(null);
    }
  };
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        await refreshUser();
      } catch {
        // Not authenticated
      } finally {
        setLoading(false);
      }
    };
    
    initAuth();
  }, []);
  
  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setAccessToken(response.accessToken);
    
    const payload = JSON.parse(atob(response.accessToken.split('.')[1]));
    setUser(payload);
    return payload;
  };
  
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

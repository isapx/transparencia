import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

function readStoredUser() {
  const storedUser = localStorage.getItem('user_transparencia');
  if (!storedUser) return null;
  try {
    const parsedUser = JSON.parse(storedUser);
    if (parsedUser && typeof parsedUser === 'object') return parsedUser;
  } catch {
    return { username: storedUser, role: 'admin' };
  }
  return { username: storedUser, role: 'admin' };
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token_transparencia') || null);
  const [user, setUser] = useState(readStoredUser);

  const login = (jwtToken, userInfo) => {
    localStorage.setItem('token_transparencia', jwtToken);
    localStorage.setItem('user_transparencia', JSON.stringify(userInfo));
    setToken(jwtToken);
    setUser(userInfo);
  };

  const logout = () => {
    localStorage.removeItem('token_transparencia');
    localStorage.removeItem('user_transparencia');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
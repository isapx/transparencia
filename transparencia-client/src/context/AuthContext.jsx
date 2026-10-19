import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token_transparencia') || null);
  const [user, setUser] = useState(localStorage.getItem('user_transparencia') || null);

  const login = (jwtToken, username) => {
    localStorage.setItem('token_transparencia', jwtToken);
    localStorage.setItem('user_transparencia', username);
    setToken(jwtToken);
    setUser(username);
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
// hooks/useAuth.ts
import { useEffect, useState } from 'react';
// Replace with your actual AWS Cognito check
const mockAuthCheck = async () => {
  return false; // pretend user is not logged in
};

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<null | boolean>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const auth = await mockAuthCheck();
      setIsAuthenticated(auth);
    };

    checkAuth();
  }, []);

  return isAuthenticated;
}

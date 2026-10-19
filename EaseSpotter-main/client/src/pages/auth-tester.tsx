import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export default function AuthTester() {
  const { user, loginMutation, logoutMutation } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');
  const [authStatus, setAuthStatus] = useState('');

  useEffect(() => {
    console.log('Current auth state:', { user });
    setAuthStatus(user ? 'Authenticated' : 'Not authenticated');
  }, [user]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Attempting login with:', { username, password });
    loginMutation.mutate({ username, password });
  };

  const handleLogout = () => {
    console.log('Logging out');
    logoutMutation.mutate();
  };

  const checkSuppliers = async () => {
    try {
      console.log('Checking suppliers API');
      const response = await fetch('/api/suppliers', { credentials: 'include' });
      console.log('Suppliers API response:', response);
      if (response.ok) {
        const data = await response.json();
        console.log('Suppliers data:', data);
        setAuthStatus(`API check successful, found ${data.length} suppliers`);
      } else {
        setAuthStatus(`API check failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('API check error:', error);
      setAuthStatus(`API check error: ${error}`);
    }
  };

  return (
    <div className="max-w-md mx-auto my-10 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Authentication Tester</h1>
      
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <h2 className="font-semibold mb-2">Current Status:</h2>
        <div className="text-sm">{authStatus}</div>
        {user && (
          <div className="mt-2 text-xs">
            <div><strong>ID:</strong> {user.id}</div>
            <div><strong>Username:</strong> {user.username}</div>
            <div><strong>Role:</strong> {user.role}</div>
            <div><strong>Vendor ID:</strong> {user.vendorId}</div>
          </div>
        )}
      </div>
      
      {!user ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <button 
            onClick={handleLogout}
            className="w-full bg-red-500 text-white p-2 rounded hover:bg-red-600"
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? 'Logging out...' : 'Log Out'}
          </button>
          
          <button 
            onClick={checkSuppliers}
            className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600"
          >
            Test Suppliers API
          </button>
        </div>
      )}
      
      {(loginMutation.isError || logoutMutation.isError) && (
        <div className="mt-4 p-3 bg-red-100 text-red-800 rounded">
          {loginMutation.error?.message || logoutMutation.error?.message}
        </div>
      )}
    </div>
  );
}
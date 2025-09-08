import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Listens for global cliNavigate and navigateToRemote events and performs SPA navigation to preserve socket connection.
export function CliNavigator() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Handle CLI navigation
    const cliHandler = (e: Event) => {
      const ce = e as CustomEvent<{ path: string }>;
      if (ce.detail?.path) navigate(ce.detail.path);
    };
    
    // Handle remote game room navigation
    const remoteHandler = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string; playerId: string; matchType: string }>;
      if (ce.detail?.roomId) {
        console.log('[CliNavigator] Navigating to remote game:', ce.detail);
        navigate('/remote');
      }
    };
    
    window.addEventListener('cliNavigate', cliHandler as any);
    window.addEventListener('navigateToRemote', remoteHandler as any);
    
    return () => {
      window.removeEventListener('cliNavigate', cliHandler as any);
      window.removeEventListener('navigateToRemote', remoteHandler as any);
    };
  }, [navigate]);
  
  return null;
}

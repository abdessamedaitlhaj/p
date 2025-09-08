import React, { ReactNode } from 'react';
import { SidebarContext, useSidebarState } from '@/hooks/useSidebar';

interface SidebarProviderProps {
  children: ReactNode;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({ children }) => {
  const sidebarState = useSidebarState();

  return (
    <SidebarContext.Provider value={sidebarState}>
      {children}
    </SidebarContext.Provider>
  );
};

export default SidebarProvider;

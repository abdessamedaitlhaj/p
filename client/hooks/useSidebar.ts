import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextType {
  isVisible: boolean;
  toggleSidebar: () => void;
  hideSidebar: () => void;
  showSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

export { SidebarContext };

// Helper hook for creating sidebar state
export const useSidebarState = () => {
  const [isVisible, setIsVisible] = useState(true);

  const toggleSidebar = () => setIsVisible(prev => !prev);
  const hideSidebar = () => setIsVisible(false);
  const showSidebar = () => setIsVisible(true);

  return {
    isVisible,
    toggleSidebar,
    hideSidebar,
    showSidebar
  };
};

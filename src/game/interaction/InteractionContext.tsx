import { createContext, useContext, useState, type ReactNode } from 'react';

export interface InteractableTarget {
  id: string;
  type: 'door' | 'window' | 'fountain' | 'switch' | 'generic';
  prompt: string;
  distance?: number;
  onInteract: () => void;
}

interface InteractionContextValue {
  activeTarget: InteractableTarget | null;
  setActiveTarget: (target: InteractableTarget | null) => void;
  triggerInteraction: () => void;
}

const InteractionContext = createContext<InteractionContextValue | null>(null);

export function useInteraction(): InteractionContextValue {
  const ctx = useContext(InteractionContext);
  if (!ctx) {
    return {
      activeTarget: null,
      setActiveTarget: () => {},
      triggerInteraction: () => {},
    };
  }
  return ctx;
}

export function InteractionProvider({ children }: { children: ReactNode }) {
  const [activeTarget, setActiveTarget] = useState<InteractableTarget | null>(null);

  const triggerInteraction = () => {
    if (activeTarget && activeTarget.onInteract) {
      activeTarget.onInteract();
    }
  };

  return (
    <InteractionContext.Provider value={{ activeTarget, setActiveTarget, triggerInteraction }}>
      {children}
    </InteractionContext.Provider>
  );
}

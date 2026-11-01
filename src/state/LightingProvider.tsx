import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { calculateAtmosphereForHour, type DynamicAtmosphere, type FountainLightingConfig } from './lightingState';

interface LightingContextValue {
  // Time in hours (0.0 to 24.0)
  timeHours: number;
  setTimeHours: (hours: number) => void;
  // Speed multiplier for accelerated time: 0 = paused, 1 = realtime, 60 = 1min/sec, etc.
  timeSpeed: number;
  setTimeSpeed: (speed: number) => void;
  // Atmospheric values calculated continuously
  atmosphere: DynamicAtmosphere;
  // Fountain lighting
  fountainLighting: FountainLightingConfig;
  setFountainLighting: (config: Partial<FountainLightingConfig> | ((prev: FountainLightingConfig) => FountainLightingConfig)) => void;
  // Manual street lamp override (null = auto from atmosphere)
  manualStreetLamps: boolean | null;
  setManualStreetLamps: (active: boolean | null) => void;
}

const LightingContext = createContext<LightingContextValue | null>(null);

export function useLighting(): LightingContextValue {
  const ctx = useContext(LightingContext);
  if (!ctx) {
    // Graceful fallback to midday if outside provider
    const atmosphere = calculateAtmosphereForHour(13.0);
    return {
      timeHours: 13.0,
      setTimeHours: () => {},
      timeSpeed: 0,
      setTimeSpeed: () => {},
      atmosphere,
      fountainLighting: { enabled: true, color: '#38bdf8', intensity: 1.0 },
      setFountainLighting: () => {},
      manualStreetLamps: null,
      setManualStreetLamps: () => {},
    };
  }
  return ctx;
}

export function LightingProvider({ children }: { children: ReactNode }) {
  const [timeHours, setTimeHours] = useState<number>(13.0); // Midday default
  const [timeSpeed, setTimeSpeed] = useState<number>(0); // 0 = static by default
  const [manualStreetLamps, setManualStreetLamps] = useState<boolean | null>(null);
  const [fountainLighting, setFountainLightingState] = useState<FountainLightingConfig>({
    enabled: true,
    color: '#38bdf8',
    intensity: 1.0,
  });

  const setFountainLighting = useCallback(
    (config: Partial<FountainLightingConfig> | ((prev: FountainLightingConfig) => FountainLightingConfig)) => {
      setFountainLightingState((prev) => {
        if (typeof config === 'function') return config(prev);
        return { ...prev, ...config };
      });
    },
    [],
  );

  // Accelerated time tick when timeSpeed > 0
  useEffect(() => {
    if (timeSpeed <= 0) return;
    const interval = window.setInterval(() => {
      setTimeHours((prev) => ((prev + (timeSpeed * 0.05) / 60) % 24 + 24) % 24);
    }, 50);
    return () => window.clearInterval(interval);
  }, [timeSpeed]);

  const baseAtmosphere = useMemo(() => calculateAtmosphereForHour(timeHours), [timeHours]);

  const atmosphere = useMemo<DynamicAtmosphere>(() => {
    if (manualStreetLamps === null) return baseAtmosphere;
    return {
      ...baseAtmosphere,
      streetLampsActive: manualStreetLamps,
    };
  }, [baseAtmosphere, manualStreetLamps]);

  const value = useMemo<LightingContextValue>(
    () => ({
      timeHours,
      setTimeHours,
      timeSpeed,
      setTimeSpeed,
      atmosphere,
      fountainLighting,
      setFountainLighting,
      manualStreetLamps,
      setManualStreetLamps,
    }),
    [timeHours, timeSpeed, atmosphere, fountainLighting, setFountainLighting, manualStreetLamps],
  );

  return <LightingContext.Provider value={value}>{children}</LightingContext.Provider>;
}

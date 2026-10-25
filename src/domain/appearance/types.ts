export type RoofType = 'hip' | 'flat' | 'parapet' | 'gabled' | 'barrel';

export type BuildingAppearance = {
  /** Identifier or name of the preset */
  preset?: string;
  /** Primary wall color in hex */
  wallColor: string;
  wallRoughness: number;
  wallMetalness: number;
  /** Roof architectural shape */
  roofType: RoofType;
  /** Roof material color */
  roofColor: string;
  roofRoughness: number;
  roofHeight?: number;
  roofOverhang?: number;
  /** Parapet / cornice border along the roofline */
  hasCornice?: boolean;
  corniceColor?: string;
  /** Ground floor foundation plinth */
  hasPlinth?: boolean;
  plinthColor?: string;
  plinthHeight?: number;
  /** Procedural exterior windows */
  hasWindows?: boolean;
  windowColor?: string;
  windowFrameColor?: string;
  windowWidth?: number;
  windowHeight?: number;
  /** Central glazed atrium or curtain wall facade */
  glassAccent?: boolean;
  glassColor?: string;
  /** Horizontal decorative band (e.g. brick or accent stripe) */
  accentStripe?: boolean;
  accentStripeColor?: string;
  /** Classical entrance portico with pediment and columns */
  hasPortico?: boolean;
  porticoColor?: string;
  /** Custom architectural facade model (e.g. 'block-c', 'block-b', 'sports-complex') */
  customFacade?: 'block-c' | 'block-b' | 'sports-complex' | 'none';
};

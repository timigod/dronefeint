export const SONAR_RADIUS = 360;

export type FogOfWarConfig = {
  baseSonarRadius: number;
};

export const DEFAULT_FOG_OF_WAR_CONFIG: FogOfWarConfig = {
  baseSonarRadius: SONAR_RADIUS,
};

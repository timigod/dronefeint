import type { StructureType } from '../structures';

export type SpecialistInstance = {
  id: string;
  name: string;
  sonarRadiusMultiplier?: number;
  // Future flags like stealth/visibility modifications can live here
};

export type CanonicalOutpost = {
  id: string;
  type: StructureType;
  position: { x: number; y: number };
  ownerId?: string;
  droneCount: number;
  specialists: SpecialistInstance[];
  sonarRadiusMultiplier?: number;
};

export type CanonicalCarrier = {
  id: string;
  ownerId: string;
  originId: string;
  destinationId: string;
  launchTime: number;
  arrivalTime: number;
  droneCount: number;
  specialists: SpecialistInstance[];
};

export type LastSeenSnapshot = {
  droneCount: number;
  specialists: SpecialistInstance[];
  seenAt: number;
};

export type PlayerLastSeenState = Map<string, Map<string, LastSeenSnapshot>>;

export type PlayerOutpostView =
  | {
      id: string;
      position: { x: number; y: number };
      type: StructureType;
      ownerId?: string;
      visibility: 'live';
      droneCount: number;
      specialists: SpecialistInstance[];
      lastSeenAt: number;
    }
  | {
      id: string;
      position: { x: number; y: number };
      type: StructureType;
      ownerId?: string;
      visibility: 'lastSeen';
      lastSeenAt: number;
      lastSeenDroneCount: number;
      lastSeenSpecialists: SpecialistInstance[];
    }
  | {
      id: string;
      position: { x: number; y: number };
      type: StructureType;
      ownerId?: string;
      visibility: 'unknown';
    };

export type CarrierView = {
  id: string;
  ownerId: string;
  originId: string;
  destinationId: string;
  launchTime: number;
  arrivalTime: number;
  droneCount: number;
  position: { x: number; y: number };
};

export type PlayerWorldView = {
  playerId: string;
  asOfTime: number;
  outposts: PlayerOutpostView[];
  carriers: CarrierView[];
};

export type RoomFunction =
    | 'KITCHEN'
    | 'MASTER_BEDROOM'
    | 'BATHROOM'
    | 'LIVING_ROOM'
    | 'DINING_ROOM'
    | 'STUDY'
    | 'GARAGE'
    | 'BEDROOM'
    | 'HALLWAY'
    | 'STORAGE'
    | 'UTILITY';

export interface RoomRequirements {
    name: string;
    function: RoomFunction;
    minAreaM2: number;
    minClearHeight: number;
    requiredAdjacencies: string[];    // must be next to these rooms
    forbiddenAdjacencies: string[];   // must NOT be next to these
    naturalLightRequired: boolean;
    externalWallRequired: boolean;
    plumbingRequired: boolean;
    minDoors: number;
    minWindows: number;
}

export const ROOM_STANDARDS: Record<RoomFunction, RoomRequirements> = {
    KITCHEN: {
        name: "Kitchen",
        function: 'KITCHEN',
        minAreaM2: 10,
        minClearHeight: 2.4,
        plumbingRequired: true,
        naturalLightRequired: true,
        requiredAdjacencies: ['DINING_ROOM'],
        forbiddenAdjacencies: [],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 1
    },
    MASTER_BEDROOM: {
        name: "Master Bedroom",
        function: 'MASTER_BEDROOM',
        minAreaM2: 14,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: true,
        requiredAdjacencies: ['BATHROOM'],
        forbiddenAdjacencies: [],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 1
    },
    BATHROOM: {
        name: "Bathroom",
        function: 'BATHROOM',
        minAreaM2: 4,
        minClearHeight: 2.4,
        plumbingRequired: true,
        naturalLightRequired: false,
        requiredAdjacencies: [],
        forbiddenAdjacencies: ['KITCHEN'],
        externalWallRequired: false,
        minDoors: 1,
        minWindows: 0
    },
    LIVING_ROOM: {
        name: "Living Room",
        function: 'LIVING_ROOM',
        minAreaM2: 20,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: true,
        requiredAdjacencies: ['DINING_ROOM', 'HALLWAY'],
        forbiddenAdjacencies: [],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 2
    },
    DINING_ROOM: {
        name: "Dining Room",
        function: 'DINING_ROOM',
        minAreaM2: 12,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: true,
        requiredAdjacencies: ['KITCHEN', 'LIVING_ROOM'],
        forbiddenAdjacencies: [],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 1
    },
    STUDY: {
        name: "Study",
        function: 'STUDY',
        minAreaM2: 8,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: true,
        requiredAdjacencies: [],
        forbiddenAdjacencies: [],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 1
    },
    GARAGE: {
        name: "Garage",
        function: 'GARAGE',
        minAreaM2: 18,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: false,
        requiredAdjacencies: [],
        forbiddenAdjacencies: ['MASTER_BEDROOM'],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 0
    },
    BEDROOM: {
        name: "Bedroom",
        function: 'BEDROOM',
        minAreaM2: 10,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: true,
        requiredAdjacencies: [],
        forbiddenAdjacencies: [],
        externalWallRequired: true,
        minDoors: 1,
        minWindows: 1
    },
    HALLWAY: {
        name: "Hallway",
        function: 'HALLWAY',
        minAreaM2: 4,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: false,
        requiredAdjacencies: [],
        forbiddenAdjacencies: [],
        externalWallRequired: false,
        minDoors: 2,
        minWindows: 0
    },
    STORAGE: {
        name: "Storage",
        function: 'STORAGE',
        minAreaM2: 2,
        minClearHeight: 2.4,
        plumbingRequired: false,
        naturalLightRequired: false,
        requiredAdjacencies: [],
        forbiddenAdjacencies: [],
        externalWallRequired: false,
        minDoors: 1,
        minWindows: 0
    },
    UTILITY: {
        name: "Utility",
        function: 'UTILITY',
        minAreaM2: 6,
        minClearHeight: 2.4,
        plumbingRequired: true,
        naturalLightRequired: false,
        requiredAdjacencies: ['KITCHEN'],
        forbiddenAdjacencies: [],
        externalWallRequired: false,
        minDoors: 1,
        minWindows: 0
    }
};

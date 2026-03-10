export interface ProjectSpecs {
  // Client Information
  clientName: string;
  clientContact: string;
  projectType: string;
  projectLocation: string;

  // Budget & Timeline
  budget: {
    total: number;
    currency: string;
    flexibility: 'fixed' | 'flexible' | 'negotiable';
  };
  timeline: {
    startDate: string;
    targetCompletion: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  };

  // Site Information
  site: {
    size: number; // in square meters
    topography: 'flat' | 'sloped' | 'steep' | 'irregular';
    orientation: string;
    access: 'easy' | 'moderate' | 'difficult';
    utilities: {
      electricity: boolean;
      water: boolean;
      sewer: boolean;
      gas: boolean;
      internet: boolean;
    };
    constraints: string[];
  };

  // Zoning & Regulations
  zoning: {
    zone: string;
    setbacks: {
      front: number;
      rear: number;
      sides: number;
    };
    heightRestrictions: number;
    far: number; // Floor Area Ratio
    coverage: number; // Maximum site coverage percentage
    parkingRequirements: number;
  };

  // Design Requirements
  requirements: {
    bedrooms: number;
    bathrooms: number;
    floors: number;
    garage: boolean;
    basement: boolean;
    attic: boolean;
    outdoorSpaces: string[];
    specialRooms: string[];
    accessibility: boolean;
    energyEfficiency: 'basic' | 'good' | 'excellent' | 'passive';
  };

  // Style & Aesthetics
  style: {
    architectural: string;
    interior: string;
    materials: string[];
    colors: string[];
    inspiration: string[];
  };

  // Lifestyle & Functionality
  lifestyle: {
    familySize: number;
    ageGroups: string[];
    workFromHome: boolean;
    entertaining: 'rarely' | 'occasionally' | 'frequently';
    cooking: 'basic' | 'enthusiast' | 'professional';
    hobbies: string[];
    pets: string[];
  };

  // Sustainability & Technology
  sustainability: {
    solarPanels: boolean;
    rainwaterHarvesting: boolean;
    greywaterSystem: boolean;
    smartHome: 'none' | 'basic' | 'advanced' | 'full';
    greenRoof: boolean;
    geothermal: boolean;
  };

  // Additional Notes
  vision: string;
  practicalNeeds: string;
  concerns: string[];
  mustHaves: string[];
  niceToHaves: string[];
  absoluteNoGos: string[];

  // Documents & Images
  documents: {
    sitePlan?: File;
    survey?: File;
    photos: File[];
    inspirationImages: File[];
    documents: File[];
  };

  // Generated Content
  generatedRequirements?: string;
  generatedConstraints?: string;
  generatedOpportunities?: string;
  aiRecommendations?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'architect' | 'client' | 'system';
  content: string;
  timestamp: Date;
  type: 'text' | 'question' | 'summary' | 'recommendation';
  attachments?: {
    type: 'image' | 'document';
    name: string;
    url: string;
  }[];
}

export interface InterviewPhase {
  id: string;
  title: string;
  description: string;
  questions: InterviewQuestion[];
  completed: boolean;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'file';
  options?: string[];
  required: boolean;
  category: 'client' | 'site' | 'budget' | 'design' | 'lifestyle';
  validation?: (value: any) => boolean | string;
}
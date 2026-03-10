import { NextRequest, NextResponse } from 'next/server';
import { ProjectSpecs } from '@/types/professional-client';
import { getProviderConfig } from '@/lib/ai/key-manager';

// Professional Client AI Agent using actual Groq API
export class ProfessionalClientAgent {
  private conversationHistory: Array<{
    role: 'architect' | 'client' | 'system';
    content: string;
    timestamp: Date;
  }> = [];
  
  private currentPhase: string = 'intro';
  private collectedSpecs: Partial<ProjectSpecs> = {};
  private phaseQuestions: Record<string, string[]> = {
    intro: [
      "Hello! I'm your professional architect. Before we begin, could you tell me your name and what brings you here today?",
      "What's the nature of your project? Are you looking to build a new home, renovate an existing one, or something else?",
      "Where are you hoping to build this project? Do you already have land, or are you still searching?"
    ],
    site: [
      "Tell me about your property. What's the approximate size in square meters?",
      "What's the topography like? Is it flat, sloped, or do we have elevation changes to work with?",
      "Are there any existing structures, trees, or site constraints we need to consider?",
      "How's the access to the site? Any issues with utilities, road access, or neighboring properties?"
    ],
    budget: [
      "What's your target budget range for this project in euros?",
      "How flexible is that budget? Fixed ceiling, or is there wiggle room for the right design?",
      "What's your ideal timeline? When would you like to start construction and move in?",
      "Any financial considerations - financing arrangements, staged payments, or budget priorities?"
    ],
    requirements: [
      "How many bedrooms and bathrooms are you thinking?",
      "What about living spaces - formal living/dining areas, or more casual layout?",
      "Any special rooms needed? Home office, gym, media room, workshop?",
      "Garage requirements? How many cars, and do you need storage or workshop space?",
      "Basement or attic space - going up, down, or staying ground level?"
    ],
    lifestyle: [
      "Tell me about your daily routine. How do you and your family use living spaces?",
      "How do you like to entertain? Big gatherings or intimate dinners?",
      "Are you avid cooks? How important is the kitchen in your daily life?",
      "Do you work from home? If so, what kind of workspace do you need?",
      "Any hobbies that need dedicated spaces? Art, music, fitness, collections?",
      "How do you feel about indoor-outdoor living? Patios, decks, gardens?"
    ],
    style: [
      "What architectural styles appeal to you? Modern, traditional, or something between?",
      "What about materials? Wood warmth, steel/glass crispness, or stone permanence?",
      "Any favorite buildings or spaces you've been in? What did you love about them?",
      "How do you want the house to feel when you walk in? Cozy/intimate or open/grand?",
      "Any colors or textures you absolutely love or hate?"
    ],
    sustainability: [
      "How important is energy efficiency? Basic insulation or full passive house?",
      "Interested in renewable energy? Solar panels, geothermal, anything like that?",
      "Smart home technology - tech enthusiast, or prefer to keep things simple?",
      "Any specific environmental concerns or sustainability goals?"
    ],
    documents: [
      "Do you have site surveys, soil reports, or existing plans to review?",
      "Any photos of the property or inspiration images to share?",
      "Have you collected magazine clippings, Pinterest boards, or other inspiration?",
      "Anything else - documents, images, or information that would help understand your vision?"
    ]
  };

  constructor() {
    this.conversationHistory = [];
  }

  async processClientMessage(message: string, attachments?: Array<{
    type: 'image' | 'document';
    name: string;
    content: string;
  }>): Promise<{
    response: string;
    nextPhase?: string;
    isComplete: boolean;
    extractedData: any;
  }> {
    
    // Add client message to history
    this.conversationHistory.push({
      role: 'client',
      content: message,
      timestamp: new Date()
    });

    // Extract information from message
    const extractedData = await this.extractInformation(message, this.currentPhase);
    
    // Update collected specs
    this.collectedSpecs = { ...this.collectedSpecs, ...extractedData };

    // Determine next action
    const shouldAdvancePhase = this.shouldAdvancePhase(message, this.currentPhase);
    let nextPhase = this.currentPhase;
    let isComplete = false;

    if (shouldAdvancePhase) {
      const phases = Object.keys(this.phaseQuestions);
      const currentIndex = phases.indexOf(this.currentPhase);
      
      if (currentIndex < phases.length - 1) {
        nextPhase = phases[currentIndex + 1];
        this.currentPhase = nextPhase;
      } else {
        isComplete = true;
      }
    }

    // Generate response using actual Groq API
    const response = await this.generateGroqResponse(message, this.currentPhase, isComplete);

    // Add architect response to history
    this.conversationHistory.push({
      role: 'architect',
      content: response,
      timestamp: new Date()
    });

    return {
      response,
      nextPhase: shouldAdvancePhase ? nextPhase : undefined,
      isComplete,
      extractedData
    };
  }

  private async generateGroqResponse(message: string, phase: string, isComplete: boolean): Promise<string> {
    try {
      const config = getProviderConfig('groq');
      
      // Build context for Groq API
      const context = this.buildGroqContext(message, phase, isComplete);
      
      // Prepare messages for Groq API
      const messages = [
        {
          role: 'system' as const,
          content: `You are a professional architect conducting a client consultation. Be concise and professional. Answer briefly about what the client mentioned, then ask the next relevant question. Focus on gathering specific technical details needed for architectural design.`
        },
        {
          role: 'user' as const,
          content: context
        }
      ];

      // Make actual Groq API call
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content;
      
      if (!aiResponse) {
        throw new Error('No response from Groq API');
      }

      return aiResponse;
    } catch (error) {
      console.error('Groq API error:', error);
      // Fallback to simple response if API fails
      return this.generateFallbackResponse(message, phase, isComplete);
    }
  }

  private buildGroqContext(message: string, phase: string, isComplete: boolean): string {
    const phaseData = this.phaseQuestions[phase];
    const currentQuestionIndex = this.conversationHistory.filter(h => h.role === 'architect').length;
    
    let context = `Current phase: ${phase}\n`;
    context += `Client's last message: "${message}"\n\n`;
    
    if (isComplete) {
      context += `All phases complete. Briefly acknowledge what the client said, then ask if they're ready to proceed with creating the requirements document.`;
    } else if (currentQuestionIndex < phaseData.length) {
      const nextQuestion = phaseData[currentQuestionIndex];
      context += `Next question to ask: "${nextQuestion}"\n\n`;
      context += `Briefly acknowledge what the client mentioned (1-2 sentences max), then ask the next question naturally.`;
    } else {
      context += `This phase is complete. Briefly acknowledge the client's input, then indicate you'll move to the next phase.`;
    }
    
    context += `\n\nKeep response under 3 sentences. Be professional and concise.`;
    
    return context;
  }

  private generateFallbackResponse(message: string, phase: string, isComplete: boolean): string {
    if (isComplete) {
      return "Excellent! I have all the information I need. Shall we proceed with creating your requirements document?";
    }

    const phaseData = this.phaseQuestions[phase];
    const currentQuestionIndex = this.conversationHistory.filter(h => h.role === 'architect').length;
    
    if (currentQuestionIndex < phaseData.length) {
      return phaseData[currentQuestionIndex];
    }

    const nextPhase = this.getNextPhase(phase);
    if (nextPhase) {
      return `Perfect! Moving on to ${this.getPhaseDescription(nextPhase)}.`;
    }

    return "Thank you for that information. Let me continue gathering details.";
  }

  private async extractInformation(message: string, phase: string): Promise<any> {
    const extracted: any = {};
    
    // Simple extraction logic - in production, use NLP
    switch (phase) {
      case 'intro':
        if (message.toLowerCase().includes('name')) {
          const nameMatch = message.match(/name[\s]*[:\-]?[\s]*([A-Za-z\s]+)/i);
          if (nameMatch) extracted.clientName = nameMatch[1].trim();
        }
        if (message.toLowerCase().includes('house') || message.toLowerCase().includes('home')) {
          extracted.projectType = 'Residential House';
        } else if (message.toLowerCase().includes('renovation')) {
          extracted.projectType = 'Renovation';
        }
        break;
        
      case 'site':
        const sizeMatch = message.match(/(\d+)[\s]*(?:square|sq|m²|m2|meter|metre)/i);
        if (sizeMatch) {
          extracted.site = { size: parseInt(sizeMatch[1]) };
        }
        
        if (message.toLowerCase().includes('flat') || message.toLowerCase().includes('level')) {
          extracted.site = { ...extracted.site, topography: 'flat' };
        } else if (message.toLowerCase().includes('slope')) {
          extracted.site = { ...extracted.site, topography: 'sloped' };
        }
        break;
        
      case 'budget':
        const budgetMatch = message.match(/(\d+[\d,]*)/);
        if (budgetMatch) {
          const amount = parseInt(budgetMatch[1].replace(/,/g, ''));
          if (amount > 10000) { // Reasonable budget threshold
            extracted.budget = { total: amount, currency: 'EUR' };
          }
        }
        
        if (message.toLowerCase().includes('fixed')) {
          extracted.budget = { ...extracted.budget, flexibility: 'fixed' };
        } else if (message.toLowerCase().includes('flexible')) {
          extracted.budget = { ...extracted.budget, flexibility: 'flexible' };
        }
        break;
        
      case 'requirements':
        const bedroomMatch = message.match(/(\d+)[\s]*bedroom/i);
        if (bedroomMatch) {
          extracted.requirements = { bedrooms: parseInt(bedroomMatch[1]) };
        }
        
        const bathroomMatch = message.match(/(\d+)[\s]*bathroom/i);
        if (bathroomMatch) {
          extracted.requirements = { 
            ...extracted.requirements, 
            bathrooms: parseInt(bathroomMatch[1]) 
          };
        }
        break;
    }
    
    return extracted;
  }

  private shouldAdvancePhase(message: string, phase: string): boolean {
    // Simple logic - in production, use more sophisticated NLP
    const minLength = 20;
    const hasContent = message.length > minLength;
    const hasPunctuation = message.includes('.') || message.includes('!') || message.includes('?');
    
    // Check if message contains relevant information for current phase
    const phaseComplete = this.isPhaseComplete(message, phase);
    
    return hasContent && hasPunctuation && phaseComplete;
  }

  private isPhaseComplete(message: string, phase: string): boolean {
    // Check if message contains key information for the phase
    switch (phase) {
      case 'intro':
        return message.toLowerCase().includes('project') || message.toLowerCase().includes('build');
      case 'site':
        return message.toLowerCase().includes('size') || message.toLowerCase().includes('property');
      case 'budget':
        return /\d+/.test(message); // Contains numbers
      case 'requirements':
        return message.toLowerCase().includes('room') || message.toLowerCase().includes('bedroom');
      case 'lifestyle':
        return message.toLowerCase().includes('family') || message.toLowerCase().includes('living');
      case 'style':
        return message.toLowerCase().includes('style') || message.toLowerCase().includes('modern') || message.toLowerCase().includes('traditional');
      case 'sustainability':
        return true; // Always advance from sustainability
      case 'documents':
        return message.toLowerCase().includes('photo') || message.toLowerCase().includes('plan') || message.length > 30;
      default:
        return true;
    }
  }

  private getNextPhase(currentPhase: string): string | null {
    const phases = Object.keys(this.phaseQuestions);
    const currentIndex = phases.indexOf(currentPhase);
    return currentIndex < phases.length - 1 ? phases[currentIndex + 1] : null;
  }

  private getPhaseDescription(phase: string): string {
    const descriptions: Record<string, string> = {
      intro: 'getting to know you and your project vision',
      site: 'understanding your land and location',
      budget: 'discussing financial constraints and schedule',
      requirements: 'your specific needs and preferences',
      lifestyle: 'how you live and what matters to you',
      style: 'visual preferences and inspiration',
      sustainability: 'environmental and technology preferences',
      documents: 'any additional documents or images'
    };
    return descriptions[phase] || phase;
  }

  public getCollectedSpecs(): any {
    return this.collectedSpecs;
  }

  public getConversationHistory(): any[] {
    return this.conversationHistory;
  }
}

// API Route Handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, attachments, conversationHistory } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Create or restore agent state
    const agent = new ProfessionalClientAgent();
    
    // If we have conversation history, restore it
    if (conversationHistory) {
      agent['conversationHistory'] = conversationHistory;
    }

    // Process the client message
    const result = await agent.processClientMessage(message, attachments);

    return NextResponse.json({
      response: result.response,
      nextPhase: result.nextPhase,
      isComplete: result.isComplete,
      extractedData: result.extractedData,
      conversationHistory: agent.getConversationHistory(),
      collectedSpecs: agent.getCollectedSpecs()
    });

  } catch (error) {
    console.error('Professional client AI error:', error);
    return NextResponse.json(
      { error: 'Failed to process client message' },
      { status: 500 }
    );
  }
}
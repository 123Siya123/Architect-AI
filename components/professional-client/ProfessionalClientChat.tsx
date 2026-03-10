'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ProjectSpecs, ChatMessage } from '@/types/professional-client';

interface ProfessionalClientChatProps {
  onComplete: (specs: ProjectSpecs) => void;
}

const INTERVIEW_PHASES = [
  {
    id: 'intro',
    title: 'Vision & Project Identity',
    description: 'Establishing the core concept and goals of your architectural journey.'
  },
  {
    id: 'site',
    title: 'Site Assessment',
    description: 'Understanding your land and location'
  },
  {
    id: 'budget',
    title: 'Budget & Timeline',
    description: 'Discussing financial constraints and schedule'
  },
  {
    id: 'requirements',
    title: 'Design Requirements',
    description: 'Your specific needs and preferences'
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle & Functionality',
    description: 'How you live and what matters to you'
  },
  {
    id: 'style',
    title: 'Style & Aesthetics',
    description: 'Visual preferences and inspiration'
  },
  {
    id: 'documents',
    title: 'Documents & Images',
    description: 'Upload site plans, photos, and inspiration'
  }
];

export function ProfessionalClientChat({ onComplete }: ProfessionalClientChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [projectSpecs, setProjectSpecs] = useState<Partial<ProjectSpecs>>({});
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const architectName = 'Professional Architect';
  const architectTitle = 'Your Design Consultant';

  useEffect(() => {
    // Initialize with welcome message
    const welcomeMessage: ChatMessage = {
      id: '1',
      role: 'architect',
      content: `Hello! I'm your ${architectName}, ${architectTitle}. I'm excited to help bring your vision to life. This initial consultation will help me understand your needs, budget, site conditions, and design preferences so we can create something truly exceptional together.\n\nLet's start with some basic information about you and your project.`,
      timestamp: new Date(),
      type: 'text'
    };
    setMessages([welcomeMessage]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && uploadedFiles.length === 0) return;

    const clientMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'client',
      content: inputValue,
      timestamp: new Date(),
      type: 'text',
      attachments: uploadedFiles.length > 0 ? uploadedFiles.map(file => ({
        type: file.type.startsWith('image/') ? 'image' : 'document',
        name: file.name,
        url: URL.createObjectURL(file)
      })) : undefined
    };

    addMessage(clientMessage);
    setInputValue('');
    setUploadedFiles([]);
    setIsTyping(true);

    try {
      // Call the professional client AI API
      const response = await fetch('/api/ai/professional-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          conversationHistory: conversationHistory,
          attachments: uploadedFiles.length > 0 ? uploadedFiles.map(file => ({
            type: file.type.startsWith('image/') ? 'image' : 'document',
            name: file.name,
            content: 'base64_encoded_content' // In real implementation, convert file to base64
          })) : undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      // Add AI response to messages
      const architectMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'architect',
        content: data.response,
        timestamp: new Date(),
        type: data.isComplete ? 'summary' : 'text'
      };

      addMessage(architectMessage);

      // Update conversation history
      setConversationHistory(data.conversationHistory);

      // Update project specs
      setProjectSpecs(prev => ({ ...prev, ...data.extractedData }));

      // Check if we should move to next phase
      if (data.nextPhase) {
        setTimeout(() => {
          const nextPhaseIndex = INTERVIEW_PHASES.findIndex(phase => phase.id === data.nextPhase);
          if (nextPhaseIndex !== -1) {
            setCurrentPhase(nextPhaseIndex);
          }
        }, 1000);
      }

      // Check if interview is complete
      if (data.isComplete) {
        setTimeout(() => {
          onComplete(data.collectedSpecs);
        }, 2000);
      }

    } catch (error) {
      console.error('Error getting AI response:', error);
      // Fallback to simple response
      const fallbackMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'architect',
        content: "Thank you for that information. Let me continue gathering details about your project.",
        timestamp: new Date(),
        type: 'text'
      };
      addMessage(fallbackMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#12121a] rounded-2xl shadow-2xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="bg-[#1a1a2e] p-8 border-b border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold tracking-tight mb-2 text-white">Professional Client Consultation</h2>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold uppercase rounded-full border border-blue-600/30">
              Phase {currentPhase + 1} of {INTERVIEW_PHASES.length}
            </span>
            <span className="text-white/60 font-medium">{INTERVIEW_PHASES[currentPhase].title}</span>
          </div>
          <p className="text-sm text-gray-400 mt-3 italic font-light">{INTERVIEW_PHASES[currentPhase].description}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-[#12121a] px-8 py-4 border-b border-white/5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Interview Progress</span>
          <span className="text-xs font-bold text-blue-400">{Math.round(((currentPhase + 1) / INTERVIEW_PHASES.length) * 100)}%</span>
        </div>
        <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full rounded-full transition-all duration-1000 ease-in-out"
            style={{ width: `${((currentPhase + 1) / INTERVIEW_PHASES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'client' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
            <div className={`max-w-[85%] ${message.role === 'client' ? 'order-2' : 'order-1'} group`}>
              <div className={`p-5 rounded-2xl ${message.role === 'client'
                ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/20'
                : message.type === 'summary'
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400 shadow-lg shadow-green-900/10'
                  : 'bg-white/5 border border-white/10 text-gray-200 backdrop-blur-md'
                }`}>
                <div
                  className={`prose prose-invert prose-sm max-w-none ${message.role === 'client' ? 'text-white' : 'text-gray-200'}`}
                  style={{ fontSize: '0.95rem', lineHeight: '1.6' }}
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                    {message.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs font-medium px-3 py-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                        <span className="text-lg">{attachment.type === 'image' ? '🖼️' : '📄'}</span>
                        <span className="truncate">{attachment.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-2 flex items-center gap-2 ${message.role === 'client' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'architect' && <span className="text-blue-500">Principal Architect</span>}
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-white/5 p-8 bg-[#161623]">
        {/* File Upload Preview */}
        {uploadedFiles.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-white group">
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="relative group">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your message here..."
              className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl resize-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-white placeholder:text-gray-500 outline-none scrollbar-none"
              rows={3}
              disabled={isTyping}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping}
                className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="Attach Files"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <button
                onClick={handleSendMessage}
                disabled={isTyping || (!inputValue.trim() && uploadedFiles.length === 0)}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-600/20 disabled:opacity-30 disabled:grayscale transition-all flex items-center gap-2 active:scale-95"
              >
                <span>Send</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 text-center uppercase tracking-widest font-medium">Professional Consultation Protocol • AI Architect v4.2</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}
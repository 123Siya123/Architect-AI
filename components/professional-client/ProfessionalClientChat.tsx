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
    title: 'Welcome & Introduction',
    description: 'Getting to know you and your project vision'
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

  const architectName = 'AI Design Architect';
  const architectTitle = 'Your Virtual Consultant';

  useEffect(() => {
    // Initialize with welcome message
    const welcomeMessage: ChatMessage = {
      id: '1',
      role: 'architect',
      content: `Hello! I am your ${architectName}, ${architectTitle}. I am excited to help bring your vision to life. This initial consultation will help me understand your needs, budget, site conditions, and design preferences so we can create something truly exceptional together.\n\nLet's start with some basic information about you and your project.`,
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
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
        <h2 className="text-2xl font-bold mb-2">Professional Client Consultation</h2>
        <p className="text-blue-100">Phase {currentPhase + 1} of {INTERVIEW_PHASES.length}: {INTERVIEW_PHASES[currentPhase].title}</p>
        <p className="text-sm text-blue-200 mt-1">{INTERVIEW_PHASES[currentPhase].description}</p>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-100 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Progress </span>
          <span className="text-sm text-gray-500">{currentPhase + 1} / {INTERVIEW_PHASES.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentPhase + 1) / INTERVIEW_PHASES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'client' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl ${message.role === 'client' ? 'order-2' : 'order-1'}`}>
              <div className={`p-4 rounded-lg ${message.role === 'client'
                ? 'bg-blue-600 text-white'
                : message.type === 'summary'
                  ? 'bg-green-50 border-2 border-green-200 text-green-800'
                  : 'bg-gray-100 text-gray-800'
                }`}>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.attachments.map((attachment, index) => (
                      <div key={index} className="text-xs opacity-75">
                        📎 {attachment.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`text-xs text-gray-500 mt-1 ${message.role === 'client' ? 'text-right' : ''}`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 p-4 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* File Upload Preview */}
      {uploadedFiles.length > 0 && (
        <div className="px-6 pb-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Files to upload:</span>
              <button
                onClick={() => setUploadedFiles([])}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-1">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-500 hover:text-red-700 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 p-6">
        <div className="flex items-end space-x-3">
          <div className="flex-1">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              disabled={isTyping}
            />
          </div>
          <div className="flex flex-col space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isTyping}
              className="p-3 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📎
            </button>
            <button
              onClick={handleSendMessage}
              disabled={isTyping || (!inputValue.trim() && uploadedFiles.length === 0)}
              className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileUpload}
          className="hidden"
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}
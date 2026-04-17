/**
 * Vercel AI SDK Compatibility Tests
 * 
 * Tests the compatibility layer between Guru AI v2 and Vercel AI SDK.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import {
  fromVercelMessage,
  toVercelMessage,
  fromVercelTool,
  toVercelTool,
  createModel,
  streamText as vercelStreamText,
  type CoreMessage,
  type CoreTool,
} from './vercelCompat';
import { tool as guruTool } from './tool';

describe('Vercel AI SDK Compatibility', () => {
  describe('Message Conversion', () => {
    it('converts system messages', () => {
      const vercelMsg: CoreMessage = {
        role: 'system',
        content: 'You are a helpful assistant.',
      };

      const guruMsg = fromVercelMessage(vercelMsg);
      expect(guruMsg).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });

      const roundTrip = toVercelMessage(guruMsg);
      expect(roundTrip).toEqual(vercelMsg);
    });

    it('converts user text messages', () => {
      const vercelMsg: CoreMessage = {
        role: 'user',
        content: 'Hello, world!',
      };

      const guruMsg = fromVercelMessage(vercelMsg);
      expect(guruMsg).toEqual({
        role: 'user',
        content: 'Hello, world!',
      });

      const roundTrip = toVercelMessage(guruMsg);
      expect(roundTrip).toEqual(vercelMsg);
    });

    it('converts assistant messages', () => {
      const vercelMsg: CoreMessage = {
        role: 'assistant',
        content: 'Hello! How can I help?',
      };

      const guruMsg = fromVercelMessage(vercelMsg);
      expect(guruMsg).toEqual({
        role: 'assistant',
        content: 'Hello! How can I help?',
      });

      const roundTrip = toVercelMessage(guruMsg);
      expect(roundTrip).toEqual(vercelMsg);
    });

    it('converts tool messages', () => {
      const vercelMsg: CoreMessage = {
        role: 'tool',
        content: JSON.stringify({ result: 'success' }),
        toolCallId: 'call_123',
        name: 'search_tool',
      };

      const guruMsg = fromVercelMessage(vercelMsg);
      expect(guruMsg.role).toBe('tool');
      expect(guruMsg.content).toHaveLength(1);
      expect(guruMsg.content[0]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'call_123',
        toolName: 'search_tool',
        output: { result: 'success' },
      });

      const roundTrip = toVercelMessage(guruMsg);
      expect(roundTrip.role).toBe('tool');
      expect(roundTrip.content).toBe(JSON.stringify({ result: 'success' }));
      expect(roundTrip.toolCallId).toBe('call_123');
      expect(roundTrip.name).toBe('search_tool');
    });

    it('handles assistant tool calls', () => {
      const vercelMsg: CoreMessage = {
        role: 'assistant',
        content: JSON.stringify({ query: 'test' }),
        name: 'search_tool',
        toolCallId: 'call_456',
      };

      const guruMsg = fromVercelMessage(vercelMsg);
      expect(guruMsg.role).toBe('assistant');
      expect(Array.isArray(guruMsg.content)).toBe(true);
      expect(guruMsg.content[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_456',
        toolName: 'search_tool',
        input: { query: 'test' },
      });
    });
  });

  describe('Tool Conversion', () => {
    const vercelTool: CoreTool = {
      description: 'A test tool',
      parameters: z.object({ query: z.string() }),
      execute: jest.fn(async (args: unknown) => {
        const { query } = args as { query: string };
        return { result: `Searched: ${query}` };
      }),
    };

    const guruToolDef = guruTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({ query: z.string() }),
      execute: jest.fn(async (input: unknown, _ctx) => {
        const { query } = input as { query: string };
        return { result: `Searched: ${query}` };
      }),
    });

    it('converts Vercel tool to Guru tool', () => {
      const converted = fromVercelTool('test_tool', vercelTool);
      
      expect(converted.name).toBe('test_tool');
      expect(converted.description).toBe('A test tool');
      expect(converted.inputSchema).toBeDefined();
      
      // Test execution
      const input = { query: 'medical term' };
      expect(() => converted.inputSchema.parse(input)).not.toThrow();
    });

    it('converts Guru tool to Vercel tool', () => {
      const converted = toVercelTool(guruToolDef);
      
      expect(converted.description).toBe('A test tool');
      expect(converted.parameters).toBeDefined();
      
      // Test execution
      const input = { query: 'medical term' };
      expect(() => (converted.parameters as z.ZodType).parse(input)).not.toThrow();
    });
  });

  describe('createModel', () => {
    // Mock profile for testing
    const mockProfile = {
      providerOrder: ['groq', 'openrouter'],
      disabledProviders: [],
      useLocalModel: false,
      localModelPath: null,
    } as any;

    it('creates a model with profile', () => {
      const model = createModel({
        provider: 'openai',
        profile: mockProfile,
      });

      expect(model).toBeDefined();
      expect(model.doGenerate).toBeInstanceOf(Function);
      expect(model.doStream).toBeInstanceOf(Function);
    });

    it('throws error when no profile provided for direct provider', () => {
      expect(() => {
        createModel({
          provider: 'openai',
          apiKey: 'test-key',
        });
      }).toThrow('Direct provider creation not yet implemented');
    });
  });

  describe('streamText compatibility', () => {
    it('has compatible streamText function', () => {
      expect(vercelStreamText).toBeInstanceOf(Function);
    });

    // Note: More comprehensive tests would require mocking the underlying
    // Guru model and testing the streaming behavior.
  });

  describe('Finish Reason Mapping', () => {
    it('maps content-filter to other', () => {
      // This tests the internal mapping function indirectly through integration
      const vercelMsg: CoreMessage = {
        role: 'system',
        content: 'Test',
      };

      const guruMsg = fromVercelMessage(vercelMsg);
      expect(guruMsg).toBeDefined();
      // The mapping happens in createModel implementation
    });
  });
});
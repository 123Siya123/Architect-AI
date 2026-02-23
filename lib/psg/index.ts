/**
 * =============================================================================
 * LIB/PSG/INDEX.TS — PSG Module Barrel Export
 * =============================================================================
 *
 * Re-exports everything from the PSG module for clean imports.
 *
 * Instead of:
 *   import { createWallNode } from '@/lib/psg/schema';
 *   import { validateOperation } from '@/lib/psg/validator';
 *
 * You can write:
 *   import { createWallNode, validateOperation } from '@/lib/psg';
 * =============================================================================
 */

export * from './schema';
export * from './validator';
export * from './operations';
export * from './compiler';
export * from './geometry';
export * from './cost-calculator';
export * from './templates';

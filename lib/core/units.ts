
/**
 * =============================================================================
 * LIB/CORE/UNITS.TS — Unit Conversion & Formatting Strategy
 * =============================================================================
 * 
 * This module centralizes all unit conversion logic for the platform.
 * 
 * CORE PRINCIPLE:
 * - Internal Database / PSG Model: ALWAYS Metric (Meters)
 * - UI / Input / Export: Configurable (Metric/Imperial)
 * 
 * This ensures mathematical consistency in the geometry engine while allowing
 * architects to work in their preferred system.
 */

export type UnitSystem = 'metric' | 'imperial';

// Conversion constants
const M_TO_FT = 3.28084;
const M_TO_IN = 39.3701;
const FT_TO_M = 1 / M_TO_FT;
const IN_TO_M = 1 / M_TO_IN;
const M2_TO_SQFT = 10.7639;
const SQFT_TO_M2 = 1 / M2_TO_SQFT;

/**
 * Precision levels for display
 * - coarse: 1.2m, 4ft
 * - standard: 1.25m, 4' 2"
 * - precise: 1.254m, 4' 2 1/4"
 */
export type PrecisionLevel = 'coarse' | 'standard' | 'precise';

/**
 * Converts a value from Meters (Internal) to the Target Unit System
 */
export function fromMeters(value: number, system: UnitSystem): number {
    if (system === 'metric') return value;
    return value * M_TO_FT; // Imperial default is Decimal Feet for calculation, formatted later
}

/**
 * Converts a value from the Target Unit System to Meters (Internal)
 */
export function toMeters(value: number, system: UnitSystem): number {
    if (system === 'metric') return value;
    return value * FT_TO_M;
}

/**
 * Formats a length value (in meters) to a display string
 */
export function formatLength(
    valueInMeters: number, 
    system: UnitSystem, 
    precision: PrecisionLevel = 'standard'
): string {
    if (system === 'metric') {
        // Metric: 1.25m or 1250mm depending on scale? 
        // For architecture, < 1m usually mm, > 1m usually m with 2-3 decimals
        
        if (Math.abs(valueInMeters) < 1.0 && valueInMeters !== 0) {
            // Millimeters for small details
            return `${Math.round(valueInMeters * 1000)}mm`;
        }
        
        const digits = precision === 'coarse' ? 1 : precision === 'standard' ? 2 : 3;
        return `${valueInMeters.toFixed(digits)}m`;
    } else {
        // Imperial: Feet & Inches (e.g., 4' 6")
        const totalInches = valueInMeters * M_TO_IN;
        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        
        if (precision === 'coarse') {
            return `${feet}' ${Math.round(inches)}"`;
        }
        
        if (precision === 'standard') {
            // Round to nearest 1/4 inch? For now, 1 decimal
            return `${feet}' ${inches.toFixed(1)}"`;
        }
        
        // Precise: 1/8 or 1/16 fractions could go here
        return `${feet}' ${inches.toFixed(2)}"`;
    }
}

/**
 * Formats an area value (in sq meters) to a display string
 */
export function formatArea(valueInSqMeters: number, system: UnitSystem): string {
    if (system === 'metric') {
        return `${valueInSqMeters.toFixed(2)} m²`;
    } else {
        return `${(valueInSqMeters * M2_TO_SQFT).toFixed(1)} sq ft`;
    }
}

/**
 * Parses a user input string into Meters
 * Supports: "1.5", "1.5m", "1500mm", "4'", "4'6"", "54""
 */
export function parseInputToMeters(input: string, defaultSystem: UnitSystem): number | null {
    const clean = input.trim().toLowerCase();
    
    if (!clean) return null;

    // Explicit Metric
    if (clean.endsWith('mm')) {
        return parseFloat(clean) / 1000;
    }
    if (clean.endsWith('cm')) {
        return parseFloat(clean) / 100;
    }
    if (clean.endsWith('m') && !clean.endsWith('mm') && !clean.endsWith('cm')) {
        return parseFloat(clean);
    }

    // Explicit Imperial
    // Regex for Feet' Inches"
    const ftInRegex = /^(\d+)'\s*(\d+(?:\.\d+)?)?"?$/;
    const match = clean.match(ftInRegex);
    if (match) {
        const feet = parseFloat(match[1]);
        const inches = match[2] ? parseFloat(match[2]) : 0;
        return (feet * 12 + inches) * IN_TO_M;
    }

    // Just Feet
    if (clean.endsWith("'")) {
        return parseFloat(clean) * FT_TO_M;
    }
    
    // Just Inches
    if (clean.endsWith('"') || clean.endsWith('in')) {
        return parseFloat(clean) * IN_TO_M;
    }

    // No suffix - assume default system
    const val = parseFloat(clean);
    if (isNaN(val)) return null;

    return toMeters(val, defaultSystem);
}

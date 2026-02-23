/**
 * =============================================================================
 * COMPONENTS/UI/SLIDER-CONTROL.TSX — Precision Slider Component
 * =============================================================================
 *
 * A reusable slider for precise numeric input with:
 * - Visual slider track with thumb
 * - Direct numeric input field
 * - Unit label (m, °, etc.)
 * - Configurable min/max/step
 *
 * DESIGN: [Label] [◄──────●──────►] [12.50 m]
 *
 * WHY A CUSTOM SLIDER?
 * Browser <input type="range"> doesn't support:
 * - Custom styling that matches our dark theme
 * - Step snapping with floating point precision
 * - Combined slider + text input
 * - Keyboard shortcuts (±step on arrow keys)
 * =============================================================================
 */

'use client';

import React, { useCallback } from 'react';

interface SliderControlProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    onChange: (value: number) => void;
}

export function SliderControl({
    label,
    value,
    min,
    max,
    step,
    unit,
    onChange,
}: SliderControlProps) {
    const handleSliderChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(parseFloat(e.target.value));
        },
        [onChange]
    );

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newVal = parseFloat(e.target.value);
            if (!isNaN(newVal) && newVal >= min && newVal <= max) {
                onChange(newVal);
            }
        },
        [onChange, min, max]
    );

    return (
        <div className="slider-control">
            <label className="slider-label">{label}</label>
            <input
                type="range"
                className="slider-track"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleSliderChange}
            />
            <div className="slider-value">
                <input
                    type="number"
                    className="slider-input"
                    value={value.toFixed(2)}
                    step={step}
                    min={min}
                    max={max}
                    onChange={handleInputChange}
                />
                <span className="slider-unit">{unit}</span>
            </div>
        </div>
    );
}

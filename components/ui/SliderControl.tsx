/**
 * =============================================================================
 * COMPONENTS/UI/SLIDER-CONTROL.TSX — Precision Numeric Slider
 * =============================================================================
 *
 * Reusable slider + number input combo for editing numeric values.
 * Used in the InspectorPanel for position, dimensions, rotation.
 * =============================================================================
 */

'use client';

import React, { useCallback, useState, useEffect } from 'react';

interface SliderControlProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    unit?: string;
}

export default function SliderControl({
    label,
    value,
    min,
    max,
    step,
    onChange,
    unit = 'm',
}: SliderControlProps) {
    const [localValue, setLocalValue] = useState(value.toFixed(2));

    // Sync local value when prop changes
    useEffect(() => {
        setLocalValue(value.toFixed(2));
    }, [value]);

    const handleSliderChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = parseFloat(e.target.value);
            setLocalValue(v.toFixed(2));
            onChange(v);
        },
        [onChange]
    );

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setLocalValue(e.target.value);
        },
        []
    );

    const handleInputBlur = useCallback(() => {
        const v = parseFloat(localValue);
        if (!isNaN(v)) {
            const clamped = Math.max(min, Math.min(max, v));
            setLocalValue(clamped.toFixed(2));
            onChange(clamped);
        } else {
            setLocalValue(value.toFixed(2));
        }
    }, [localValue, min, max, value, onChange]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                handleInputBlur();
            }
        },
        [handleInputBlur]
    );

    // Calculate fill percentage for slider track
    const fillPercent = ((value - min) / (max - min)) * 100;

    return (
        <div className="slider-control">
            <label className="slider-label">{label}</label>
            <div className="slider-row">
                <input
                    type="range"
                    className="slider-range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleSliderChange}
                    style={{
                        background: `linear-gradient(to right, #4466ff ${fillPercent}%, #333 ${fillPercent}%)`,
                    }}
                />
                <div className="slider-input-wrap">
                    <input
                        type="text"
                        className="slider-input"
                        value={localValue}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={handleKeyDown}
                    />
                    <span className="slider-unit">{unit}</span>
                </div>
            </div>
        </div>
    );
}

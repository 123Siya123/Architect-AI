'use client';

import React, { useState, useEffect } from 'react';
import { useDesignStore } from '@/store/useDesignStore';

interface SpecificationsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SpecificationsModal({ isOpen, onClose }: SpecificationsModalProps) {
    const userSpecifications = useDesignStore((s) => s.userSpecifications);
    const setUserSpecifications = useDesignStore((s) => s.setUserSpecifications);

    const [localSpecs, setLocalSpecs] = useState(userSpecifications);

    useEffect(() => {
        if (isOpen) {
            setLocalSpecs(userSpecifications);
        }
    }, [isOpen, userSpecifications]);

    if (!isOpen) return null;

    const handleSave = () => {
        setUserSpecifications(localSpecs);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Project Specifications</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    <p className="modal-description">
                        Enter any global specifications, rules, styling preferences, sizes, or norms you want the AI to always keep in context while designing.
                    </p>

                    <textarea
                        value={localSpecs}
                        onChange={(e) => setLocalSpecs(e.target.value)}
                        placeholder="e.g. Always use standard US architectural norms. Ceilings should be 10ft. Prefer modern minimalist style with large windows."
                        style={{
                            width: '100%',
                            height: '200px',
                            padding: '12px',
                            background: 'rgba(0,0,0,0.2)',
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '4px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            marginTop: '12px'
                        }}
                    />
                </div>

                <div className="modal-footer">
                    <button className="modal-btn secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="modal-btn primary" onClick={handleSave}>
                        Save Specifications
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * =============================================================================
 * COMPONENTS/UI/IMAGE-TO-3D-MODAL.TSX 
 * =============================================================================
 *
 * Modal allowing the user to upload a house image and a reference measurement
 * to auto-generate a 3D structural model.
 * =============================================================================
 */

import React, { useState, useRef } from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import type { PSGOperation } from '@/types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ImageTo3DModal({ isOpen, onClose }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [base64Data, setBase64Data] = useState<string | null>(null);
    const [referenceMeasurement, setReferenceMeasurement] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const project = useDesignStore((s) => s.project);
    const applyOp = useDesignStore((s) => s.applyOp);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);

        // Create preview URL
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreviewUrl(objectUrl);

        // Convert to base64 for API
        const reader = new FileReader();
        reader.onloadend = () => {
            setBase64Data(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
        setError(null);
    };

    const handleGenerate = async () => {
        if (!base64Data) {
            setError('Please select an image first.');
            return;
        }
        if (!referenceMeasurement.trim()) {
            setError('Please provide a reference measurement (e.g. "The front door is 2m high").');
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            const response = await fetch('/api/ai/image-to-3d', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_data: base64Data,
                    reference_measurement: referenceMeasurement,
                    project,
                    budget: project.budget.total_budget,
                    currency: project.budget.currency
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to generate 3D model.');
            }

            const ops: PSGOperation[] = data.operations || [];

            // Apply operations sequentially
            let successCount = 0;
            for (const op of ops) {
                const result = applyOp(op);
                if (result.success) successCount++;
            }

            console.log(`[ImageTo3D] Applied ${successCount}/${ops.length} operations.`);

            // Close modal on success
            onClose();

        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
                <div className="modal-header">
                    <h2>📸 Photo to 3D Model</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                        Upload a photo of a house and the AI will analyze its architecture and translate it directly into your 3D canvas.
                    </p>

                    {/* Image Upload Area */}
                    <div
                        className="upload-area"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: 'var(--border-radius)',
                            padding: 'var(--space-6)',
                            textAlign: 'center',
                            cursor: 'pointer',
                            marginBottom: 'var(--space-4)',
                            background: 'var(--bg-input)',
                            transition: 'all var(--transition-fast)'
                        }}
                    >
                        {previewUrl ? (
                            <img
                                src={previewUrl}
                                alt="Preview"
                                style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }}
                            />
                        ) : (
                            <div style={{ color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>📥</div>
                                Click to select or drag & drop an image here.
                            </div>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* Reference Measurement */}
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                        <label style={{ display: 'block', marginBottom: 'var(--space-2)', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                            Reference Measurement (Required)
                        </label>
                        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
                            To get perfect metric scale, please tell the AI the real-world size of one element in the photo.
                        </p>
                        <input
                            className="chat-input"
                            style={{ width: '100%' }}
                            value={referenceMeasurement}
                            onChange={(e) => setReferenceMeasurement(e.target.value)}
                            placeholder="e.g. 'The green front door is 2.1m high'"
                            disabled={isGenerating}
                        />
                    </div>

                    {error && (
                        <div style={{ padding: 'var(--space-3)', background: 'rgba(255,68,85,0.1)', color: 'var(--accent-danger)', borderRadius: 'var(--border-radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                            {error}
                        </div>
                    )}

                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', padding: 'var(--space-4)', borderTop: '1px solid var(--border-color)' }}>
                    <button className="toolbar-btn" onClick={onClose} disabled={isGenerating}>
                        Cancel
                    </button>
                    <button
                        className="export-btn"
                        onClick={handleGenerate}
                        disabled={!base64Data || !referenceMeasurement.trim() || isGenerating}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {isGenerating ? (
                            <>
                                <span className="chat-thinking-dot" style={{ animation: 'dots 1.5s infinite step-start 0s' }} /> Processing...
                            </>
                        ) : 'Generate 3D'}
                    </button>
                </div>
            </div>
        </div>
    );
}

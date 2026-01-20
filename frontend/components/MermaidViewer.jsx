"use client";

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid once
mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'inherit',
});

const MermaidViewer = ({ code, id = 'mermaid-diagram' }) => {
    const containerRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!containerRef.current || !code) return;

        const renderDiagram = async () => {
            try {
                setError(null);
                containerRef.current.innerHTML = ''; // Clear previous content

                // Generate a unique ID for this specific render instance
                const renderId = `mermaid-${id}-${Math.floor(Math.random() * 10000)}`;

                const { svg } = await mermaid.render(renderId, code);
                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                    // Add responsiveness to SVG
                    const svgElement = containerRef.current.querySelector('svg');
                    if (svgElement) {
                        svgElement.style.maxWidth = '100%';
                        svgElement.style.height = 'auto';
                    }
                }
            } catch (err) {
                console.error('Mermaid Render Error:', err);
                setError('Failed to render diagram. Please check the Mermaid syntax.');
            }
        };

        renderDiagram();
    }, [code, id]);

    if (!code) return <div className="p-4 text-[var(--color-text-muted)] italic">No diagram code provided</div>;

    return (
        <div className="mermaid-viewer w-full overflow-auto bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 min-h-[300px] flex items-center justify-center relative shadow-sm">
            {error ? (
                <div className="bg-red-50 text-[var(--color-danger)] p-6 rounded-xl border border-red-100 flex flex-col items-center max-w-md text-center">
                    <span className="mb-2 font-bold uppercase tracking-wider text-[10px]">Render Error</span>
                    <p className="text-sm font-medium">{error}</p>
                    <pre className="mt-4 p-3 bg-[var(--color-surface-strong)] text-[var(--color-text-muted)] text-[10px] rounded-lg w-full text-left overflow-auto max-h-[150px] font-mono border border-[var(--color-border)]">
                        {code}
                    </pre>
                </div>
            ) : (
                <div ref={containerRef} className="w-full flex justify-center py-2" data-diagram-id={id} />
            )}
        </div>
    );
};

export default MermaidViewer;

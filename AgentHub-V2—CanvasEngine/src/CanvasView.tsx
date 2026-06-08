import React from 'react';

export function CanvasView() {
  return (
    <div className="h-full w-full bg-canvas-bg" data-testid="canvas-view">
      {/* ReactFlow canvas will be rendered here by CanvasEngine */}
    </div>
  );
}

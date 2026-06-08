import type { CatalogComponentName } from '@shared/types';
import { ChoiceCards } from './components/ChoiceCards';
import { ColorPickerGrid } from './components/ColorPickerGrid';
import { SliderRange } from './components/SliderRange';
import { ConfirmCard } from './components/ConfirmCard';

export interface RendererProps {
  component: CatalogComponentName;
  props: Record<string, unknown>;
  componentId: string;
  onSubmit: (value: { componentId: string; value: unknown }) => void;
}

/**
 * GenUI Renderer — maps catalog component names to their React components.
 * Wraps each component's onSubmit to inject componentId into the callback payload.
 * Renders an error card for unknown component types.
 */
export function Renderer({
  component,
  props,
  componentId,
  onSubmit,
}: RendererProps) {
  const handleSubmit = (value: unknown) => {
    onSubmit({ componentId, value });
  };

  switch (component) {
    case 'ChoiceCards':
      return <ChoiceCards {...(props as any)} onSubmit={handleSubmit} />;
    case 'ColorPickerGrid':
      return <ColorPickerGrid {...(props as any)} onSubmit={handleSubmit} />;
    case 'SliderRange':
      return <SliderRange {...(props as any)} onSubmit={handleSubmit} />;
    case 'ConfirmCard':
      return <ConfirmCard {...(props as any)} onSubmit={handleSubmit} />;
    default:
      return (
        <div className="rounded-xl bg-red-50 p-4 border border-red-200 text-red-700 text-sm">
          未知组件类型: {component}
        </div>
      );
  }
}

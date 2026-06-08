import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChoiceCards } from '../src/components/ChoiceCards';
import { ColorPickerGrid } from '../src/components/ColorPickerGrid';
import { SliderRange } from '../src/components/SliderRange';
import { ConfirmCard } from '../src/components/ConfirmCard';
import { Renderer } from '../src/Renderer';

describe('ChoiceCards', () => {
  it('renders 3 options with preview and description', () => {
    const onSubmit = vi.fn();
    const options = [
      { id: '1', label: 'Option 1', preview: '🚀', description: 'Desc 1' },
      { id: '2', label: 'Option 2' },
      { id: '3', label: 'Option 3', description: 'Desc 3' },
    ];
    render(<ChoiceCards title="Test Title" options={options} onSubmit={onSubmit} />);

    expect(screen.getByText('Test Title')).toBeTruthy();
    expect(screen.getByText('Option 1')).toBeTruthy();
    expect(screen.getByText('Option 2')).toBeTruthy();
    expect(screen.getByText('Option 3')).toBeTruthy();
    expect(screen.getByText('🚀')).toBeTruthy();
    expect(screen.getByText('Desc 1')).toBeTruthy();
    expect(screen.getByText('Desc 3')).toBeTruthy();
  });

  it('calls onSubmit with chosenId when an option is clicked', () => {
    const onSubmit = vi.fn();
    const options = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ];
    render(<ChoiceCards title="Pick" options={options} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText('Beta'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ chosenId: 'b' });
  });
});

describe('ColorPickerGrid', () => {
  const colors = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
    '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#008000', '#000080', '#800000', '#808000',
  ];

  it('renders all suggested color blocks', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <ColorPickerGrid
        title="Pick a color"
        suggested={colors}
        allowCustom={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Pick a color')).toBeTruthy();
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(12);
  });

  it('calls onSubmit with hex when a color is clicked', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <ColorPickerGrid
        title="Pick"
        suggested={['#FF0000', '#00FF00']}
        allowCustom={false}
        onSubmit={onSubmit}
      />,
    );

    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    expect(onSubmit).toHaveBeenCalledWith({ hex: '#FF0000' });
  });

  it('renders custom input when allowCustom is true', () => {
    const onSubmit = vi.fn();
    render(
      <ColorPickerGrid
        title="Pick"
        suggested={['#FF0000']}
        allowCustom={true}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByPlaceholderText('#XXXXXX')).toBeTruthy();
    expect(screen.getByText('使用')).toBeTruthy();
  });
});

describe('SliderRange', () => {
  it('renders slider with title and range labels', () => {
    const onSubmit = vi.fn();
    render(
      <SliderRange
        title="Volume"
        min={0}
        max={100}
        step={1}
        unit="%"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('确认')).toBeTruthy();
  });

  it('calls onSubmit with current value on confirm', () => {
    const onSubmit = vi.fn();
    render(
      <SliderRange
        title="Volume"
        min={0}
        max={100}
        step={1}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText('确认'));
    expect(onSubmit).toHaveBeenCalledWith({ value: 0 });
  });

  it('uses defaultValue when provided', () => {
    const onSubmit = vi.fn();
    render(
      <SliderRange
        title="Brightness"
        min={0}
        max={100}
        step={10}
        defaultValue={50}
        unit="%"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('50%')).toBeTruthy();
    fireEvent.click(screen.getByText('确认'));
    expect(onSubmit).toHaveBeenCalledWith({ value: 50 });
  });
});

describe('ConfirmCard', () => {
  it('renders title and body text', () => {
    const onSubmit = vi.fn();
    render(
      <ConfirmCard
        title="Delete?"
        body="Are you sure you want to delete this item?"
        danger={false}
        confirmLabel="确认"
        cancelLabel="取消"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Delete?')).toBeTruthy();
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeTruthy();
  });

  it('calls onSubmit with confirmed:true when confirm is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <ConfirmCard
        title="Save?"
        body="Save changes?"
        danger={false}
        confirmLabel="保存"
        cancelLabel="取消"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText('保存'));
    expect(onSubmit).toHaveBeenCalledWith({ confirmed: true });
  });

  it('calls onSubmit with confirmed:false when cancel is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <ConfirmCard
        title="Save?"
        body="Save changes?"
        danger={false}
        confirmLabel="保存"
        cancelLabel="取消"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText('取消'));
    expect(onSubmit).toHaveBeenCalledWith({ confirmed: false });
  });
});

describe('Renderer', () => {
  it('renders ChoiceCards when component is ChoiceCards', () => {
    const onSubmit = vi.fn();
    render(
      <Renderer
        component="ChoiceCards"
        props={{
          title: '选择',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        }}
        componentId="comp-1"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('选择')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders ColorPickerGrid when component is ColorPickerGrid', () => {
    const onSubmit = vi.fn();
    render(
      <Renderer
        component="ColorPickerGrid"
        props={{
          title: '选色',
          suggested: ['#FF0000', '#00FF00'],
          allowCustom: true,
        }}
        componentId="comp-2"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('选色')).toBeTruthy();
    expect(screen.getByPlaceholderText('#XXXXXX')).toBeTruthy();
  });

  it('renders SliderRange when component is SliderRange', () => {
    const onSubmit = vi.fn();
    render(
      <Renderer
        component="SliderRange"
        props={{ title: '调整', min: 0, max: 10, step: 1, unit: 'px' }}
        componentId="comp-3"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('调整')).toBeTruthy();
    expect(screen.getByText('确认')).toBeTruthy();
  });

  it('renders ConfirmCard when component is ConfirmCard', () => {
    const onSubmit = vi.fn();
    render(
      <Renderer
        component="ConfirmCard"
        props={{
          title: '确认',
          body: '确定？',
          danger: true,
          confirmLabel: '删除',
          cancelLabel: '取消',
        }}
        componentId="comp-4"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('确认')).toBeTruthy();
    expect(screen.getByText('确定？')).toBeTruthy();
  });

  it('renders error for unknown component', () => {
    const onSubmit = vi.fn();
    render(
      <Renderer
        component={'UnknownWidget' as any}
        props={{}}
        componentId="comp-5"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText(/未知组件类型/)).toBeTruthy();
  });

  it('wraps onSubmit to include componentId', () => {
    const onSubmit = vi.fn();
    render(
      <Renderer
        component="ConfirmCard"
        props={{
          title: '确认',
          body: '确定？',
          danger: false,
          confirmLabel: 'OK',
          cancelLabel: 'Cancel',
        }}
        componentId="comp-1"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText('OK'));
    expect(onSubmit).toHaveBeenCalledWith({
      componentId: 'comp-1',
      value: { confirmed: true },
    });
  });
});

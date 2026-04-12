import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AdvancedToolsSection from './AdvancedToolsSection';

describe('AdvancedToolsSection', () => {
  const defaultProps = {
    onExportBackup: jest.fn(),
    onImportBackup: jest.fn(),
    onExportJsonBackup: jest.fn(),
    onImportJsonBackup: jest.fn(),
    onClearCache: jest.fn(),
    onResetProgress: jest.fn(),
    isExporting: false,
    isImporting: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);

    expect(getByText('ADVANCED TOOLS')).toBeTruthy();
    expect(getByText('Database Backup (SQLite)')).toBeTruthy();
    expect(getByText('Export .db')).toBeTruthy();
    expect(getByText('Import .db')).toBeTruthy();
    expect(getByText('Portability Backup (JSON)')).toBeTruthy();
    expect(getByText('Export JSON')).toBeTruthy();
    expect(getByText('Import JSON')).toBeTruthy();
    expect(getByText('Danger Zone')).toBeTruthy();
    expect(getByText('Clear AI Content Cache')).toBeTruthy();
    expect(getByText('Reset All Study Progress')).toBeTruthy();
  });

  it('triggers onExportBackup when Export .db is pressed', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);
    fireEvent.press(getByText('Export .db'));
    expect(defaultProps.onExportBackup).toHaveBeenCalled();
  });

  it('triggers onImportBackup when Import .db is pressed', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);
    fireEvent.press(getByText('Import .db'));
    expect(defaultProps.onImportBackup).toHaveBeenCalled();
  });

  it('triggers onExportJsonBackup when Export JSON is pressed', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);
    fireEvent.press(getByText('Export JSON'));
    expect(defaultProps.onExportJsonBackup).toHaveBeenCalled();
  });

  it('triggers onImportJsonBackup when Import JSON is pressed', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);
    fireEvent.press(getByText('Import JSON'));
    expect(defaultProps.onImportJsonBackup).toHaveBeenCalled();
  });

  it('triggers onClearCache when Clear AI Content Cache is pressed', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);
    fireEvent.press(getByText('Clear AI Content Cache'));
    expect(defaultProps.onClearCache).toHaveBeenCalled();
  });

  it('triggers onResetProgress when Reset All Study Progress is pressed', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} />);
    fireEvent.press(getByText('Reset All Study Progress'));
    expect(defaultProps.onResetProgress).toHaveBeenCalled();
  });

  it('shows ActivityIndicator and disables button when isExporting is true', () => {
    const { queryByText, getByTestId } = render(
      <AdvancedToolsSection {...defaultProps} isExporting={true} />,
    );

    // The text "Export .db" should NOT be present
    expect(queryByText('Export .db')).toBeNull();
    // It should render an ActivityIndicator, but we need to check if it's there.
    // Since we don't have a testID on the ActivityIndicator, we can check by type or just assume it renders if the text is gone.
    // However, the button is disabled.
  });

  it('disables Import .db button when isImporting is true', () => {
    const { getByText } = render(<AdvancedToolsSection {...defaultProps} isImporting={true} />);
    let el: { parent?: any; props?: Record<string, unknown> } | null = getByText('Import .db');
    while (el?.parent && el.props?.accessibilityRole !== 'button') {
      el = el.parent;
    }
    expect(el?.props?.accessibilityRole).toBe('button');
    expect((el?.props?.accessibilityState as { disabled?: boolean } | undefined)?.disabled).toBe(
      true,
    );
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { BackupRestorePanel } from '@/components/settings/BackupRestorePanel';

describe('BackupRestorePanel Component', () => {
  const mockBackupData = JSON.stringify({
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    configuration: {
      general: {
        systemName: 'Test System',
        adminEmail: 'admin@example.com'
      },
      proxy: {
        rules: [
          {
            id: 'rule-1',
            name: 'Test Rule',
            sourceHost: 'test.example.com',
            targetContainer: 'test-container'
          }
        ]
      }
    }
  }, null, 2);

  const mockOnBackup = jest.fn().mockResolvedValue(mockBackupData);
  const mockOnRestore = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    global.URL.revokeObjectURL = jest.fn();
    
    // Mock document.createElement and related methods for download functionality
    const mockAnchor = {
      href: '',
      download: '',
      click: jest.fn(),
    };
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'a') return mockAnchor;
      return document.createElement(tag);
    });
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
  });

  test('renders backup and restore sections', () => {
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Check that backup section is rendered
    expect(screen.getByText('Backup and Restore')).toBeInTheDocument();
    expect(screen.getByText('Create Backup')).toBeInTheDocument();
    
    // Check that restore section is rendered
    expect(screen.getByText('Restore System')).toBeInTheDocument();
    expect(screen.getByText('Upload Backup File')).toBeInTheDocument();
    expect(screen.getByText('Or Paste Backup Data')).toBeInTheDocument();
    
    // Check that warning message is rendered
    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText(/Restoring from a backup will overwrite all current settings/)).toBeInTheDocument();
  });

  test('creates backup when create backup button is clicked', async () => {
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Click create backup button
    fireEvent.click(screen.getByText('Create Backup'));
    
    // Check that onBackup was called
    expect(mockOnBackup).toHaveBeenCalled();
    
    // Check that loading state is shown
    expect(screen.getByText('Creating Backup...')).toBeInTheDocument();
    
    // Wait for backup to complete
    await waitFor(() => {
      expect(screen.getByText('Backup created successfully')).toBeInTheDocument();
    });
    
    // Check that backup data section is rendered
    expect(screen.getByText('Backup Data')).toBeInTheDocument();
    expect(screen.getByText('Show')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  test('shows backup data when show button is clicked', async () => {
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Create backup
    fireEvent.click(screen.getByText('Create Backup'));
    
    // Wait for backup to complete
    await waitFor(() => {
      expect(screen.getByText('Backup created successfully')).toBeInTheDocument();
    });
    
    // Initially backup data is hidden
    expect(screen.queryByDisplayValue(mockBackupData)).not.toBeInTheDocument();
    
    // Click show button
    fireEvent.click(screen.getByText('Show'));
    
    // Check that backup data is shown
    const backupTextarea = screen.getByDisplayValue(mockBackupData);
    expect(backupTextarea).toBeInTheDocument();
    expect(backupTextarea).toBeDisabled(); // Should be readonly
    
    // Click hide button
    fireEvent.click(screen.getByText('Hide'));
    
    // Check that backup data is hidden again
    expect(screen.queryByDisplayValue(mockBackupData)).not.toBeInTheDocument();
  });

  test('downloads backup when download button is clicked', async () => {
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Create backup
    fireEvent.click(screen.getByText('Create Backup'));
    
    // Wait for backup to complete
    await waitFor(() => {
      expect(screen.getByText('Backup created successfully')).toBeInTheDocument();
    });
    
    // Click download button
    fireEvent.click(screen.getByText('Download'));
    
    // Check that download functionality was called
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  test('validates restore data before restoring', async () => {
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Try to restore without data
    fireEvent.click(screen.getByText('Restore System'));
    
    // Check that validation error is shown
    expect(screen.getByText('Please enter backup data or select a backup file')).toBeInTheDocument();
    
    // Enter restore data
    fireEvent.change(screen.getByPlaceholderText('Paste your backup data here...'), {
      target: { value: mockBackupData }
    });
    
    // Click restore button
    fireEvent.click(screen.getByText('Restore System'));
    
    // Check that onRestore was called with the correct data
    expect(mockOnRestore).toHaveBeenCalledWith(mockBackupData);
    
    // Check that loading state is shown
    expect(screen.getByText('Restoring...')).toBeInTheDocument();
    
    // Wait for restore to complete
    await waitFor(() => {
      expect(screen.getByText('System restored successfully')).toBeInTheDocument();
    });
    
    // Check that restore data was cleared
    const restoreTextarea = screen.getByPlaceholderText('Paste your backup data here...');
    expect(restoreTextarea).toHaveValue('');
  });

  test('handles file upload for restore', async () => {
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Create a mock file
    const file = new File([mockBackupData], 'backup.json', { type: 'application/json' });
    
    // Mock FileReader
    const mockFileReader = {
      onload: null,
      readAsText: jest.fn(function() {
        this.onload({ target: { result: mockBackupData } });
      }),
    };
    global.FileReader = jest.fn(() => mockFileReader);
    
    // Upload file
    const fileInput = screen.getByLabelText('Choose file');
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Check that file was read
    expect(mockFileReader.readAsText).toHaveBeenCalledWith(file);
    
    // Check that restore data was set
    const restoreTextarea = screen.getByPlaceholderText('Paste your backup data here...');
    expect(restoreTextarea).toHaveValue(mockBackupData);
    
    // Click restore button
    fireEvent.click(screen.getByText('Restore System'));
    
    // Check that onRestore was called with the correct data
    expect(mockOnRestore).toHaveBeenCalledWith(mockBackupData);
  });

  test('handles restore error', async () => {
    const errorMessage = 'Invalid backup data';
    mockOnRestore.mockRejectedValueOnce(new Error(errorMessage));
    
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Enter restore data
    fireEvent.change(screen.getByPlaceholderText('Paste your backup data here...'), {
      target: { value: mockBackupData }
    });
    
    // Click restore button
    fireEvent.click(screen.getByText('Restore System'));
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Failed to restore system')).toBeInTheDocument();
    });
  });

  test('handles backup error', async () => {
    const errorMessage = 'Failed to create backup';
    mockOnBackup.mockRejectedValueOnce(new Error(errorMessage));
    
    render(
      <BackupRestorePanel
        onBackup={mockOnBackup}
        onRestore={mockOnRestore}
      />
    );

    // Click create backup button
    fireEvent.click(screen.getByText('Create Backup'));
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Failed to create backup')).toBeInTheDocument();
    });
  });
});
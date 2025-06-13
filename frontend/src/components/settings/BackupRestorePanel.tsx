import React, { useState } from 'react';

interface BackupRestorePanelProps {
  onBackup: () => Promise<string>;
  onRestore: (data: string) => Promise<void>;
}

export const BackupRestorePanel: React.FC<BackupRestorePanelProps> = ({
  onBackup,
  onRestore,
}) => {
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [backupData, setBackupData] = useState<string>('');
  const [restoreData, setRestoreData] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showBackupData, setShowBackupData] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Handle backup
  const handleBackup = async () => {
    setIsBackingUp(true);
    setError(null);
    setSuccess(null);
    
    try {
      const data = await onBackup();
      setBackupData(data);
      setSuccess('Backup created successfully');
    } catch (err) {
      console.error('Error creating backup:', err);
      setError('Failed to create backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Handle restore
  const handleRestore = async () => {
    if (!restoreData.trim()) {
      setError('Please enter backup data or select a backup file');
      return;
    }
    
    setIsRestoring(true);
    setError(null);
    setSuccess(null);
    
    try {
      await onRestore(restoreData);
      setSuccess('System restored successfully');
      setRestoreData('');
      setSelectedFile(null);
    } catch (err) {
      console.error('Error restoring system:', err);
      setError('Failed to restore system');
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setRestoreData(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  // Handle download backup
  const handleDownloadBackup = () => {
    if (!backupData) return;
    
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kontainers-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clear messages when user starts typing
  const handleRestoreDataChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRestoreData(e.target.value);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Backup and Restore</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>
            Create a backup of your system configuration or restore from a previous backup.
            The backup includes all settings, proxy rules, and custom configurations.
          </p>
        </div>
        
        {/* Error and Success Messages */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}
        
        {success && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">{success}</h3>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-8 grid grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-x-8">
          {/* Backup Section */}
          <div>
            <h4 className="text-base font-medium text-gray-900">Create Backup</h4>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleBackup}
                disabled={isBackingUp}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isBackingUp ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Backup...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Create Backup
                  </>
                )}
              </button>
            </div>
            
            {backupData && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-sm font-medium text-gray-700">Backup Data</h5>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowBackupData(!showBackupData)}
                      className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {showBackupData ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadBackup}
                      className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
                
                {showBackupData && (
                  <div className="mt-2">
                    <textarea
                      readOnly
                      value={backupData}
                      rows={8}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md bg-gray-50"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Restore Section */}
          <div>
            <h4 className="text-base font-medium text-gray-900">Restore System</h4>
            <div className="mt-4">
              <label htmlFor="restoreFile" className="block text-sm font-medium text-gray-700">
                Upload Backup File
              </label>
              <div className="mt-1 flex items-center">
                <input
                  id="restoreFile"
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <label
                  htmlFor="restoreFile"
                  className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {selectedFile ? selectedFile.name : 'Choose file'}
                </label>
              </div>
            </div>
            
            <div className="mt-4">
              <label htmlFor="restoreData" className="block text-sm font-medium text-gray-700">
                Or Paste Backup Data
              </label>
              <div className="mt-1">
                <textarea
                  id="restoreData"
                  name="restoreData"
                  rows={8}
                  value={restoreData}
                  onChange={handleRestoreDataChange}
                  placeholder="Paste your backup data here..."
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div className="mt-4">
              <button
                type="button"
                onClick={handleRestore}
                disabled={isRestoring || !restoreData.trim()}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Restoring...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Restore System
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-8 border-t border-gray-200 pt-5">
          <div className="rounded-md bg-yellow-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Important</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Restoring from a backup will overwrite all current settings and configurations.
                    Make sure to create a backup of your current system before restoring.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
import React from 'react';
import { ParallelDataOrchestrator } from './components/ParallelDataOrchestrator';
import { FileExplorerProvider } from './context/FileExplorerContext';
import { ResumeChatWidget } from './components/ResumeChatWidget';

export default function App() {
  return (
    <FileExplorerProvider>
      <ParallelDataOrchestrator />
      <ResumeChatWidget />
    </FileExplorerProvider>
  );
}

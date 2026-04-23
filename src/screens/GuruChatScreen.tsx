import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import GuruChatScreenContent from './chat/GuruChatScreenContent';

export default function GuruChatScreen() {
  return (
    <ErrorBoundary>
      <GuruChatScreenContent />
    </ErrorBoundary>
  );
}

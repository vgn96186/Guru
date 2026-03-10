// Known study apps and their deep link patterns
// We use web URLs that often trigger App Links on Android
// AND custom schemes for more reliable app launching

export interface ExternalApp {
  id: string;
  name: string;
  packageName: string; // Android package name
  webUrl: string;      // Fallback or App Link trigger
  customScheme?: string; // Custom scheme if known (e.g. marrow://)
  iconEmoji: string;
  color: string;
}

export const EXTERNAL_APPS: ExternalApp[] = [
  {
    id: 'cerebellum',
    name: 'Cerebellum',
    packageName: 'com.cerebellummobileapp',
    webUrl: 'https://cerebellumacademy.com',
    customScheme: 'cerebellum://',
    iconEmoji: '🧠',
    color: '#E91E63',
  },
  {
    id: 'dbmci',
    name: 'DBMCI One',
    packageName: 'one.dbmci',
    webUrl: 'https://dbmci.one',
    customScheme: 'dbmci://',
    iconEmoji: '🩺',
    color: '#2196F3',
  },
  {
    id: 'marrow',
    name: 'Marrow',
    packageName: 'com.marrow',
    webUrl: 'https://www.marrow.com',
    customScheme: 'marrow://',
    iconEmoji: '💊',
    color: '#00BCD4',
  },
  {
    id: 'prepladder',
    name: 'Prepladder',
    packageName: 'com.prepladder.learningapp',
    webUrl: 'https://www.prepladder.com',
    customScheme: 'prepladder://',
    iconEmoji: '🪜',
    color: '#FFC107',
  },
  {
    id: 'bhatia',
    name: 'Dr. Bhatia',
    packageName: 'com.dbmci.bhatia',
    webUrl: 'https://www.dbmci.com',
    iconEmoji: '👨‍⚕️',
    color: '#4CAF50',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    webUrl: 'https://www.youtube.com',
    customScheme: 'vnd.youtube://',
    iconEmoji: '▶️',
    color: '#FF0000',
  },
];

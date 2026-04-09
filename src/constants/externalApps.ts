// Known study apps and their deep link patterns
// We use web URLs that often trigger App Links on Android
// AND custom schemes for more reliable app launching

export interface ExternalApp {
  id: string;
  name: string;
  packageName: string; // Android package name
  webUrl: string; // Fallback or App Link trigger
  customScheme?: string; // Custom scheme if known (e.g. marrow://)
  iconName: string; // Ionicons icon name
  color: string;
}

export const EXTERNAL_APPS: ExternalApp[] = [
  {
    id: 'cerebellum',
    name: 'Cerebellum',
    packageName: 'com.cerebellummobileapp',
    webUrl: 'https://cerebellumacademy.com',
    customScheme: 'cerebellum://',
    iconName: 'hardware-chip-outline',
    color: '#E91E63',
  },
  {
    id: 'dbmci',
    name: 'DBMCI One',
    packageName: 'one.dbmci',
    webUrl: 'https://dbmci.one',
    customScheme: 'dbmci://',
    iconName: 'medical-outline',
    color: '#2196F3',
  },
  {
    id: 'marrow',
    name: 'Marrow',
    packageName: 'com.marrow',
    webUrl: 'https://www.marrow.com',
    customScheme: 'marrow://',
    iconName: 'bone-outline',
    color: '#00BCD4',
  },
  {
    id: 'prepladder',
    name: 'Prepladder',
    packageName: 'com.prepladder.learningapp',
    webUrl: 'https://www.prepladder.com',
    customScheme: 'prepladder://',
    iconName: 'arrow-up-circle-outline',
    color: '#FFC107',
  },
  {
    id: 'bhatia',
    name: 'Dr. Bhatia',
    packageName: 'com.dbmci.bhatia',
    webUrl: 'https://www.dbmci.com',
    iconName: 'medical-outline',
    color: '#4CAF50',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    webUrl: 'https://www.youtube.com',
    customScheme: 'vnd.youtube://',
    iconName: 'play-circle-outline',
    color: '#FF0000',
  },
];

module.exports = function (api) {
  api.cache(true);
  const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  try {
    const fs = require('fs');
    fs.appendFileSync('babel-debug.log', `Babel config: isTest=${isTest} NODE_ENV=${process.env.NODE_ENV} JEST_WORKER_ID=${process.env.JEST_WORKER_ID}\n`);
  } catch (e) {}
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: isTest ? undefined : 'nativewind', runtime: 'automatic' }],
      !isTest && 'nativewind/babel',
    ].filter(Boolean),
    plugins: [['babel-plugin-inline-import', { extensions: ['.sql'] }], 'react-native-reanimated/plugin'],
  };
};

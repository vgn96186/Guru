module.exports = {
  rules: {
    'prefer-settings-primitives': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Warns if <TextInput> or StyleSheet.create is used directly in settings components',
          category: 'Best Practices',
          recommended: false,
        },
        schema: [], // no options
        messages: {
          avoidTextInput:
            'Avoid using <TextInput> directly in settings components. Use <TextField> instead.',
          avoidStyleSheet:
            'Avoid using StyleSheet.create directly in settings components. Use <SettingsSection> or Tailwind instead.',
        },
      },
      create: function (context) {
        return {
          JSXOpeningElement(node) {
            if (node.name && node.name.name === 'TextInput') {
              context.report({
                node,
                messageId: 'avoidTextInput',
              });
            }
          },
          CallExpression(node) {
            if (
              node.callee &&
              node.callee.type === 'MemberExpression' &&
              node.callee.object.name === 'StyleSheet' &&
              node.callee.property.name === 'create'
            ) {
              context.report({
                node,
                messageId: 'avoidStyleSheet',
              });
            }
          },
        };
      },
    },
    'prefer-screen-shell': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Warns if <SafeAreaView> is used in screens instead of <ScreenShell>',
          category: 'Best Practices',
          recommended: false,
        },
        schema: [],
        messages: {
          avoidSafeAreaView: 'Avoid using <SafeAreaView> in screens. Use <ScreenShell> instead.',
        },
      },
      create: function (context) {
        return {
          JSXOpeningElement(node) {
            if (node.name && node.name.name === 'SafeAreaView') {
              context.report({
                node,
                messageId: 'avoidSafeAreaView',
              });
            }
          },
        };
      },
    },
  },
};

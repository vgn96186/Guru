const React = require('react');

const wrap = (name) =>
  React.forwardRef(({ children, ...props }, ref) =>
    React.createElement(name, { ...props, ref }, children),
  );

module.exports = {
  __esModule: true,
  KeyboardProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  KeyboardStickyView: wrap('KeyboardStickyView'),
  KeyboardAwareScrollView: wrap('KeyboardAwareScrollView'),
  KeyboardToolbar: wrap('KeyboardToolbar'),
};

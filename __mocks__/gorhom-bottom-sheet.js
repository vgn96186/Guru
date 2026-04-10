const React = require('react');

const BottomSheetModal = React.forwardRef(({ children, ...props }, ref) => {
  React.useImperativeHandle(ref, () => ({
    present: jest.fn(),
    dismiss: jest.fn(),
  }));
  return React.createElement('BottomSheetModal', props, children);
});

const wrap = (name) =>
  React.forwardRef(({ children, ...props }, ref) =>
    React.createElement(name, { ...props, ref }, children),
  );

module.exports = {
  __esModule: true,
  BottomSheetModalProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  BottomSheetModal,
  BottomSheetBackdrop: () => null,
  BottomSheetScrollView: wrap('BottomSheetScrollView'),
  BottomSheetView: wrap('BottomSheetView'),
};

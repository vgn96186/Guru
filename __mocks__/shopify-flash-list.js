const React = require('react');

const FlashList = React.forwardRef(
  (
    { data = [], renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent, ...props },
    ref,
  ) => {
    React.useImperativeHandle(ref, () => ({
      scrollToOffset: jest.fn(),
      scrollToEnd: jest.fn(),
      scrollToIndex: jest.fn(),
    }));

    const children = [];

    if (ListHeaderComponent) {
      children.push(
        React.isValidElement(ListHeaderComponent)
          ? ListHeaderComponent
          : React.createElement(ListHeaderComponent),
      );
    }

    if (data.length === 0 && ListEmptyComponent) {
      children.push(
        React.isValidElement(ListEmptyComponent)
          ? ListEmptyComponent
          : React.createElement(ListEmptyComponent),
      );
    } else {
      data.forEach((item, index) => {
        children.push(
          React.createElement(
            React.Fragment,
            { key: keyExtractor ? keyExtractor(item, index) : String(index) },
            renderItem ? renderItem({ item, index }) : null,
          ),
        );
      });
    }

    return React.createElement('FlashList', props, children);
  },
);

module.exports = {
  __esModule: true,
  FlashList,
};

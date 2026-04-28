const React = require('react');
const { View } = require('react-native');

function MockSvgElement(props) {
  return React.createElement(View, props, props.children);
}

module.exports = {
  __esModule: true,
  default: MockSvgElement,
  Svg: MockSvgElement,
  Path: MockSvgElement,
  G: MockSvgElement,
  Rect: MockSvgElement,
  Circle: MockSvgElement,
  Defs: MockSvgElement,
  LinearGradient: MockSvgElement,
  RadialGradient: MockSvgElement,
  Stop: MockSvgElement,
  Mask: MockSvgElement,
  ClipPath: MockSvgElement,
};

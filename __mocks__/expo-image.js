const React = require('react');

const Image = ({ children, ...props }) => React.createElement('ExpoImage', props, children);

module.exports = {
  __esModule: true,
  Image,
  default: Image,
};

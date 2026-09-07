// Lets us do `import ClockIcon from '../../assets/icons/clock.svg'` and use
// it as a normal React component, instead of loading SVGs as static image
// assets. Needed for the tab bar icons in HomeScreen.js / TabIcons.js.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
};

module.exports = config;
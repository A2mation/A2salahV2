// DrawerMenu is rendered in App.js as a sibling of AppNavigator, outside
// the NavigationContainer tree (see the comment in App.js for why) — so it
// can't use the normal useNavigation() hook, which only works for
// descendants of NavigationContainer.
//
// This ref is React Navigation's documented way to navigate from outside
// the navigator: AppNavigator attaches it to <NavigationContainer ref={...}>,
// and any other file (like DrawerMenu.js) can import `navigate` here to
// trigger navigation without needing to be inside the navigation tree.
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

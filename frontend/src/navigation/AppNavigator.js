import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import HomeScreen from '../screens/HomeScreen';
import TuneTimingsScreen from '../screens/TuneTimingsScreen';
import DateTuneScreen from '../screens/DateTuneScreen';
import AboutScreen from '../screens/AboutScreen';
import { navigationRef } from './navigationRef';
import LegalScreen from '../screens/LegalScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="TuneTimings"
          component={TuneTimingsScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen
          name="DateTune"
          component={DateTuneScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen
          name="About"
          component={AboutScreen}
          options={{ presentation: 'card' }}
        />
        <Stack.Screen
          name="Legal"
          component={LegalScreen}
          options={{ presentation: 'card' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
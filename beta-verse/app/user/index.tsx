import { StyleSheet, Text, View, Image, ImageBackground, TouchableOpacity } from 'react-native';
import React from 'react';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';

export default function Login() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require('@/assets/images/loginbg.png')}
      resizeMode="cover"
      className="flex-1"
    >
      <View className="flex-1 m-[28] justify-center">
        <View>
          <Text className="text-white text-[30px]" style={{ fontFamily: 'Poppins_500Medium' }}>
            You vs the
          </Text>
          <Text className="text-white text-[64px]" style={{ fontFamily: 'Poppins_600SemiBold' }}>
            World
          </Text>
        </View>

        <Image className='items-center my-4 border-2 border-white rounded-lg p-2' style={{ width: 380, height: 280 }} source={require('@/assets/images/logo.png')} />

        <View>
          <Text className="text-red-500" style={{ fontFamily: 'Poppins_400Regular' }}>
            Welcome
          </Text>
          <Text className="text-red-500" style={{ fontFamily: 'Poppins_400Regular' }}>
            Beta VerseBeta VerseBeta VerseBeta VerseBeta Verse...
          </Text>
        </View>

        <TouchableOpacity>
          <Text className="text-white text-xl" style={{ fontFamily: 'Poppins_500Medium' }}>
            Log in
          </Text>
        </TouchableOpacity>

        <TouchableOpacity>
          <Text className="text-white text-lg" style={{ fontFamily: 'Poppins_400Regular' }}>
            Create a new account
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

import { StyleSheet, Text, View, Image} from 'react-native'
import React from 'react'

const singup = () => {
  return (
    <View>
      <Text>singup</Text>
      <Image source={require('@/assets/images/signupbg.png')} style={styles.signup_bg} />
      
    </View>
  )
}

export default singup

const styles = StyleSheet.create({
    signup_bg:{
        flex:1,
        margin:"auto",
    }
})
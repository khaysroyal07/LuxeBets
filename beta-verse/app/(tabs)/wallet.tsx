import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';

const transactions = [
  {
    id: 1,
    icon: require('@/assets/icons/deposit.png'),
    title: 'Deposit',
    date: 'June 28, 2025',
    amount: '+1000.00',
    color: 'green',
  },
  {
    id: 2,
    icon: require('@/assets/icons/target.png'),
    title: 'Tournament Bid – $20',
    date: 'June 25, 2025',
    amount: '-20.00',
    color: 'red',
  },
  {
    id: 3,
    icon: require('@/assets/icons/trophy.png'),
    title: 'Winnings',
    date: 'June 20, 2025',
    amount: '+50.00',
    color: 'green',
  },
  {
    id: 4,
    icon: require('@/assets/icons/target.png'),
    title: 'Tournament Bid – $20',
    date: 'June 19, 2025',
    amount: '-20.00',
    color: 'red',
  },
  {
    id: 5,
    icon: require('@/assets/icons/deposit.png'),
    title: 'Deposit',
    date: 'June 28, 2025',
    amount: '+300.00',
    color: 'green',
  },
  {
    id: 6,
    icon: require('@/assets/icons/target.png'),
    title: 'Tournament Bid – $20',
    date: 'June 19, 2025',
    amount: '-20.00',
    color: 'red',
  },
  {
    id: 7,
    icon: require('@/assets/icons/target.png'),
    title: 'Tournament Bid – $20',
    date: 'June 19, 2025',
    amount: '-20.00',
    color: 'red',
  },
];

export default function WalletScreen() {
  const [fontsLoaded] = useFonts({
    Poppins: require('@/assets/fonts/Poppins-Regular.ttf'),
    PoppinsMedium: require('@/assets/fonts/Poppins-Medium.ttf'),
    PoppinsSemiBold: require('@/assets/fonts/Poppins-SemiBold.ttf'),
    PoppinsBold: require('@/assets/fonts/Poppins-Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
        <Ionicons name="settings-outline" size={24} color="#2C0735" />
      </View>

      <LinearGradient colors={['#478299', '#2C0735']} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceAmount}>$120.00</Text>
        <TouchableOpacity style={styles.withdrawButton}>
          <Text style={styles.withdrawText}>Withdraw</Text>
        </TouchableOpacity>
      </LinearGradient>

      <Text style={styles.sectionTitle}>Transaction History</Text>

      <ScrollView style={styles.transactionList}>
        {transactions.map((item) => (
          <View key={item.id} style={styles.transactionItem}>
            <Image source={item.icon} style={styles.icon} />
            <View style={styles.transactionText}>
              <Text style={styles.transactionTitle}>{item.title}</Text>
              <Text style={styles.transactionDate}>{item.date}</Text>
            </View>
            <Text style={[styles.amount, { color: item.color }]}>
              {item.amount}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    marginTop: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: 'PoppinsBold',
    color: '#2C0735',
  },
  balanceCard: {
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
    marginBottom: 30
  },
  balanceLabel: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'PoppinsMedium',
  },
  balanceAmount: {
    fontSize: 36,
    color: 'white',
    fontFamily: 'PoppinsBold',
    marginVertical: 10,
  },
  withdrawButton: {
    backgroundColor: '#ffffff33',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  withdrawText: {
    color: 'white',
    fontFamily: 'PoppinsMedium',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PoppinsSemiBold',
    color: '#2C0735',
    marginBottom: 10,
  },
  transactionList: {
    flex: 1,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.4,
    borderBottomColor: '#ccc',
  },
  icon: {
    width: 38,
    height: 38,
    marginRight: 15,
    borderRadius: 10,
  },
  transactionText: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 15,
    fontFamily: 'PoppinsMedium',
    color: '#2C0735',
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: 'Poppins',
    color: '#888',
  },
  amount: {
    fontSize: 16,
    fontFamily: 'PoppinsSemiBold',
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    borderTopWidth: 0.4,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
  },
});

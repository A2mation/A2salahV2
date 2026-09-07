import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { light as colors } from '../theme/colors';
import * as cityApi from '../api/api';

function formatCountdown(targetIso) {
  if (!targetIso) return null;
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return '00:00:00';
  const totalSec = Math.floor(diffMs / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h} : ${m} : ${s}`;
}

const PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_LABELS = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Ishaa' };

function CityCard({ city, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const hoursLabel =
    city.hoursBehind === 0
      ? 'Same time as you'
      : city.hoursBehind > 0
      ? `${city.hoursBehind} hour${city.hoursBehind === 1 ? '' : 's'} behind`
      : `${Math.abs(city.hoursBehind)} hour${Math.abs(city.hoursBehind) === 1 ? '' : 's'} ahead`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded((v) => !v)}
      onLongPress={() => onDelete(city)}
      style={styles.card}
    >
      <View style={styles.cardHeaderRow}>
        <View>
          <Text style={styles.cityName}>{city.name}</Text>
          <Text style={styles.hoursBehind}>{hoursLabel}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.clockIcon}>🕐</Text>
        <Text style={styles.currentTime}>{city.currentTime}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.bellIcon}>🔔</Text>
        <Text style={styles.nextTime}>{city.next?.localTime}</Text>
        <Text style={styles.nextLabel}>{city.next?.label}</Text>
        <Text style={styles.countdown}>- {formatCountdown(city.next?.time)}</Text>
      </View>

      {expanded && (
        <View style={styles.expandedList}>
          {PRAYER_ORDER.map((key) => (
            <View key={key} style={styles.expandedRow}>
              <Text style={styles.expandedTime}>{city.times?.[key]}</Text>
              <Text style={styles.expandedLabel}>{PRAYER_LABELS[key]}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function WorldCitiesScreen() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [catalog, setCatalog] = useState([]);

  const fetchCities = useCallback(async () => {
    try {
      const { data } = await cityApi.getWorldCities();
      setCities(data);
    } catch (err) {
      console.warn('Failed to fetch world cities', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  const openAddModal = async () => {
    try {
      const { data } = await cityApi.getWorldCityCatalog();
      setCatalog(data);
      setAddModalVisible(true);
    } catch (err) {
      Alert.alert('Error', 'Could not load city list');
    }
  };

  const handleAdd = async (cityKey) => {
    try {
      await cityApi.addWorldCity(cityKey);
      setAddModalVisible(false);
      fetchCities();
    } catch (err) {
      Alert.alert('Could not add city', err?.response?.data?.message || 'Something went wrong');
    }
  };

  const handleDelete = (city) => {
    Alert.alert('Remove city', `Remove ${city.name} from your World Cities?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await cityApi.deleteWorldCity(city._id);
            fetchCities();
          } catch (err) {
            Alert.alert('Error', 'Could not remove city');
          }
        },
      },
    ]);
  };

  const handleClearAll = async () => {
    setMenuOpen(false);
    if (cities.length === 0) return;
    Alert.alert('Remove all cities', 'This clears your whole World Cities list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove all',
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all(cities.map((c) => cityApi.deleteWorldCity(c._id)));
            fetchCities();
          } catch (err) {
            Alert.alert('Error', 'Could not clear cities');
          }
        },
      },
    ]);
  };

  const addedKeys = new Set(cities.map((c) => c.cityKey));
  const availableCatalog = catalog.filter((c) => !addedKeys.has(c.key));

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>World Cities</Text>
        <View style={styles.titleIcons}>
          <TouchableOpacity onPress={openAddModal} hitSlop={10} style={{ marginRight: 18 }}>
            <Text style={styles.titleIcon}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} hitSlop={10}>
            <Text style={styles.titleIcon}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      {menuOpen && (
        <View style={styles.menu}>
          <TouchableOpacity onPress={handleClearAll} style={styles.menuItem}>
            <Text style={styles.menuItemText}>Delete all</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.gold} size="large" style={{ marginTop: 60 }} />
      ) : cities.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No cities added yet</Text>
          <Text style={styles.emptyDescription}>
            Tap the + above to add cities like Makkah, Medina, or any other city and see their prayer times
            alongside yours.
          </Text>
        </View>
      ) : (
        <FlatList
          data={cities}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <CityCard city={item} onDelete={handleDelete} />}
        />
      )}

      <Modal visible={addModalVisible} animationType="slide" transparent onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a City</Text>
            <FlatList
              data={availableCatalog}
              keyExtractor={(item) => item.key}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.catalogRow} onPress={() => handleAdd(item.key)}>
                  <Text style={styles.catalogCity}>{item.name}</Text>
                  <Text style={styles.catalogCountry}>{item.country}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.allAddedText}>All catalog cities have been added.</Text>}
            />
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, backgroundColor: colors.white },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 16 },
  title: { color: '#111', fontSize: 28, fontWeight: '800' },
  titleIcons: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { fontSize: 22, color: '#333' },
  menu: {
    position: 'absolute',
    top: 56,
    right: 20,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 18 },
  menuItemText: { color: colors.navy, fontSize: 14 },
  emptyCard: { paddingTop: 60, alignItems: 'center', paddingHorizontal: 12 },
  emptyTitle: { color: '#333', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  emptyDescription: { color: '#777', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  list: { paddingBottom: 20 },
  card: { borderBottomWidth: 1, borderBottomColor: '#EEE', paddingVertical: 16 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cityName: { color: '#111', fontSize: 20, fontWeight: '600' },
  hoursBehind: { color: '#999', fontSize: 13, marginTop: 2 },
  chevron: { color: '#999', fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  clockIcon: { fontSize: 14, color: colors.gold, marginRight: 8 },
  currentTime: { color: '#111', fontSize: 17, fontWeight: '600' },
  bellIcon: { fontSize: 14, marginRight: 8 },
  nextTime: { color: '#111', fontSize: 17, fontWeight: '600', marginRight: 10 },
  nextLabel: { color: '#555', fontSize: 15, flex: 1 },
  countdown: { color: '#333', fontSize: 14 },
  expandedList: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F1F1' },
  expandedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  expandedTime: { color: '#444', fontSize: 14 },
  expandedLabel: { color: '#444', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: '#111', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  catalogRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F1F1' },
  catalogCity: { color: '#111', fontSize: 16 },
  catalogCountry: { color: '#999', fontSize: 14 },
  allAddedText: { color: '#999', fontSize: 14, textAlign: 'center', paddingVertical: 30 },
  cancelBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: colors.gold, fontSize: 15, fontWeight: '700' },
});

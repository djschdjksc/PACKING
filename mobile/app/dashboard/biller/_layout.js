import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function BillerTabsLayout() {
    return (
        <Tabs screenOptions={{
            headerShown: true,
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: 'gray',
        }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Form',
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="pencil-box-multiple" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="items"
                options={{
                    title: 'All Items',
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="view-list" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="daywise"
                options={{
                    title: 'Day Wise',
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="calendar-range" color={color} size={size} />
                    ),
                }}
            />
            <Tabs.Screen
                name="userwise"
                options={{
                    title: 'User Wise',
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="account-group" color={color} size={size} />
                    ),
                }}
            />
        </Tabs>
    );
}

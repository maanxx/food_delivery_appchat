import React, { Suspense, lazy } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { FoodProvider } from "../src/contexts/FoodContext";
import { CartProvider } from "../src/contexts/CartContext";
import { AddressProvider } from "../src/contexts/AddressContext";
import { SocketProvider } from "../src/contexts/SocketContext";
import { CallProvider, useCall } from "../src/contexts/CallContext";
import { View, ActivityIndicator } from "react-native";

import CallOverlay from "../src/components/Chat/CallOverlay";

function RootLayoutNav() {
    const { isLoading } = useAuth();
    const { incomingCall, activeCall } = useCall();

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
                <ActivityIndicator size="large" color="#FF4B3A" />
            </View>
        );
    }

    return (
        <SocketProvider>
            <AddressProvider>
                <FoodProvider>
                    <CartProvider>
                        <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="index" />
                            <Stack.Screen name="login" />
                            <Stack.Screen name="register" />
                            <Stack.Screen name="forgot-password" />
                            <Stack.Screen name="add-address" />
                            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        </Stack>
                        
                        {(incomingCall || activeCall) && (
                            <CallOverlay />
                        )}
                    </CartProvider>
                </FoodProvider>
            </AddressProvider>
        </SocketProvider>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AuthProvider>
                    <CallProvider>
                        <RootLayoutNav />
                    </CallProvider>
                </AuthProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

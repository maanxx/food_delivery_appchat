import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from "react";
import { View, 
    Text, 
    FlatList, 
    StyleSheet, 
    ActivityIndicator, 
    RefreshControl,
    TextInput,
    TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import ChatApi from "../../src/services/chatApi";
import SocketService from "../../src/services/socketService";
import ConversationItem from "../../src/components/Chat/ConversationItem";
import { ChatColors } from "../../src/theme/chatTheme";
import { useSocket } from "../../src/contexts/SocketContext";
import { useAuth } from "../../src/contexts/AuthContext";

const ChatListScreen = () => {
    const router = useRouter();
    const [conversations, setConversations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { onlineUsers } = useSocket();
    const { user: currentUser } = useAuth();

    const loadConversations = async () => {
        try {
            const data = await ChatApi.getConversations();
            setConversations(data.conversations || []);
        } catch (error) {
            console.error("Failed to load conversations:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadConversations();

            let isMounted = true;

            const handleConversationUpdated = (data: any) => {
                if (!isMounted) return;
                setConversations((prev) => {
                    const existingIndex = prev.findIndex((c) => c.conversationId === data.conversationId);
                    if (existingIndex > -1) {
                        const updated = [...prev];
                        updated[existingIndex] = { ...updated[existingIndex], ...data };
                        return updated.sort((a, b) => {
                            const aTime = new Date(a.lastMessageTimestamp || a.createdAt || 0).getTime();
                            const bTime = new Date(b.lastMessageTimestamp || b.createdAt || 0).getTime();
                            return bTime - aTime;
                        });
                    } else {
                        loadConversations();
                        return prev;
                    }
                });
            };

            const initSocket = async () => {
                await SocketService.connect();
                if (!isMounted) return;
                SocketService.on("conversation_updated", handleConversationUpdated);
            };

            initSocket();

            return () => {
                isMounted = false;
                SocketService.off("conversation_updated", handleConversationUpdated);
            };
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadConversations();
    };

    const navigateToChat = (conversation: any) => {
        router.push({
            pathname: "/chat/[id]",
            params: {
                id: conversation.conversationId,
                conversationName: conversation.name,
                avatar: conversation.avatarPath,
            }
        });
    };

    const handleDelete = (id: string) => {
        // Implement delete logic via API
        setConversations(prev => prev.filter(c => c.conversationId !== id));
    };

    const filteredConversations = conversations.filter(c => 
        c.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={ChatColors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Tin nhắn</Text>
                <View style={styles.headerButtons}>
                    <TouchableOpacity onPress={() => router.push("/chat/create-group")} style={styles.headerIcon}>
                        <Feather name="users" size={22} color={ChatColors.black} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push("/chat/new")} style={styles.headerIcon}>
                        <Feather name="edit" size={22} color={ChatColors.black} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={ChatColors.gray} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Tìm kiếm cuộc trò chuyện..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                            <Ionicons name="close-circle" size={18} color={ChatColors.gray} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <FlatList
                data={filteredConversations}
                keyExtractor={(item) => item.conversationId}
                renderItem={({ item }) => {
                    const peer = item.participants?.find((p: any) => p.userId !== currentUser?.id && p.userId !== currentUser?.user_id);
                    const isOnline = peer ? (onlineUsers[peer.userId] !== undefined ? onlineUsers[peer.userId] : peer.isOnline) : item.isOnline;
                    const itemWithOnline = { ...item, isOnline };
                    return (
                        <ConversationItem 
                            item={itemWithOnline} 
                            onPress={navigateToChat}
                            onDelete={handleDelete}
                            onMute={() => {}}
                            onArchive={() => {}}
                        />
                    );
                }}
                refreshControl={
                    <RefreshControl 
                        refreshing={refreshing} 
                        onRefresh={onRefresh} 
                        colors={[ChatColors.primary]} 
                    />
                }
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconContainer}>
                            <Ionicons name="chatbubbles-outline" size={60} color={ChatColors.gray} />
                        </View>
                        <Text style={styles.emptyTitle}>Chưa có cuộc trò chuyện</Text>
                        <Text style={styles.emptySubtitle}>Bắt đầu nhắn tin với bạn bè ngay nào!</Text>
                        <TouchableOpacity 
                            style={styles.newChatButton}
                            onPress={() => router.push("/chat/new")}
                        >
                            <Text style={styles.newChatButtonText}>Bắt đầu trò chuyện</Text>
                        </TouchableOpacity>
                    </View>
                }
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: "bold",
        color: ChatColors.black,
    },
    headerButtons: {
        flexDirection: "row",
        gap: 16,
    },
    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#f2f2f7",
        justifyContent: "center",
        alignItems: "center",
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f2f2f7",
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
        color: ChatColors.black,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
    },
    listContainer: {
        paddingBottom: 20,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 100,
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: "#f8f9fa",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: ChatColors.black,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 16,
        color: ChatColors.gray,
        textAlign: "center",
        marginBottom: 24,
    },
    newChatButton: {
        backgroundColor: ChatColors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 25,
    },
    newChatButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
});

export default ChatListScreen;

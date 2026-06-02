import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ChatApi from "../../src/services/chatApi";

const NewChatScreen = () => {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);

    const loadUsers = async (query: string) => {
        if (!query.trim()) {
            setUsers([]);
            setFilteredUsers([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await ChatApi.getAvailableUsers(query);
            setUsers(data || []);
            setFilteredUsers(data || []);
        } catch (error: any) {
            console.error("Failed to load users:", error);
            setError(error.message || "Không thể tải danh sách người dùng");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Initially show nothing or load a small subset if available
        setLoading(false);
    }, []);

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (text.trim().length >= 1) {
            loadUsers(text);
        } else {
            setUsers([]);
            setFilteredUsers([]);
            setLoading(false);
            setError(null);
        }
    };

    const handleSelectUser = async (user: any) => {
        console.log("handleSelectUser called with:", user);
        try {
            // Get or create conversation with this user
            console.log("Requesting getOrCreateDirectConversation for participant:", user.user_id);
            const conversation = await ChatApi.getOrCreateDirectConversation(user.user_id);
            console.log("Conversation received:", conversation);
            
            if (!conversation || !conversation.conversationId) {
                console.error("Invalid conversation object returned:", conversation);
                return;
            }

            // Navigate to chat detail screen
            const navigationParams = {
                id: conversation.conversationId,
                conversationName: user.fullname || user.email,
                avatar: user.avatar || user.avatar_path,
            };
            console.log("Navigating to /chat/[id] with params:", navigationParams);

            router.push({
                pathname: "/chat/[id]",
                params: navigationParams
            });
        } catch (error) {
            console.error("Failed to create/open conversation:", error);
        }
    };

    const renderUser = ({ item }: { item: any }) => {
        const isOnline = item.is_online === 1;

        return (
            <TouchableOpacity style={styles.userItem} onPress={() => handleSelectUser(item)}>
                <View style={styles.avatarContainer}>
                    <Image
                        source={item.avatar || item.avatar_path ? { uri: item.avatar || item.avatar_path } : require("../../src/assets/images/user-avatar.jpg")}
                        style={styles.avatar}
                    />
                    {isOnline && <View style={styles.onlineIndicator} />}
                </View>
                <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                        {item.fullname || "User"}
                    </Text>
                    <Text style={styles.userEmail} numberOfLines={1}>
                        {item.email}
                    </Text>
                </View>
                <Ionicons name="chatbubble-outline" size={20} color="#FF4B3A" />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Tìm người chat</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Tìm theo tên hoặc email..."
                    value={searchQuery}
                    onChangeText={handleSearch}
                    autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => handleSearch("")}>
                        <Ionicons name="close-circle" size={20} color="#888" />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF4B3A" />
                </View>
            ) : error ? (
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={60} color="#ff4d4d" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={() => loadUsers(searchQuery)}>
                        <Text style={styles.retryText}>Thử lại</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={filteredUsers}
                    keyExtractor={(item) => item.user_id}
                    renderItem={renderUser}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="people-outline" size={60} color="#ccc" />
                            <Text style={styles.emptyText}>
                                {searchQuery.trim() 
                                    ? "Không tìm thấy người dùng nào." 
                                    : "Nhập tên hoặc email để tìm kiếm bạn bè."}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
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
        paddingTop: 50,
        paddingBottom: 15,
        paddingHorizontal: 20,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#333",
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f5f5f5",
        marginHorizontal: 15,
        marginTop: 15,
        marginBottom: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
        height: 40,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: "#333",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    listContainer: {
        paddingBottom: 20,
    },
    userItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
    },
    avatarContainer: {
        position: "relative",
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#eee",
    },
    onlineIndicator: {
        position: "absolute",
        bottom: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: "#4CAF50",
        borderWidth: 2,
        borderColor: "#fff",
    },
    userInfo: {
        flex: 1,
        marginLeft: 15,
        justifyContent: "center",
    },
    userName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 13,
        color: "#666",
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 100,
    },
    emptyText: {
        marginTop: 10,
        fontSize: 16,
        color: "#888",
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    errorText: {
        marginTop: 10,
        fontSize: 16,
        color: "#ff4d4d",
        textAlign: "center",
    },
    retryButton: {
        marginTop: 20,
        paddingHorizontal: 30,
        paddingVertical: 10,
        backgroundColor: "#FF4B3A",
        borderRadius: 20,
    },
    retryText: {
        color: "#fff",
        fontWeight: "bold",
    },
});

export default NewChatScreen;

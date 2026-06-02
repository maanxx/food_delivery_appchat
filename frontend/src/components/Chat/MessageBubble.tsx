import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import API_CONFIG from "../../configs/api";
import VoicePlayer from "./VoicePlayer";
import { ChatColors } from "../../theme/chatTheme";

const { width } = Dimensions.get("window");

const VideoAttachment = ({ url, isGrid, onLongPress, item }: any) => {
    const player = useVideoPlayer(url, (player) => {
        player.loop = false;
        player.muted = true;
    });

    return (
        <TouchableOpacity 
            style={[styles.videoContainer, isGrid && styles.gridItem]}
            onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onLongPress(item);
            }}
            delayLongPress={300}
        >
            <VideoView
                player={player}
                style={styles.messageVideo}
                contentFit="cover"
                nativeControls={false}
            />
            <View style={styles.videoPlayOverlay}>
                <Ionicons name="play-circle" size={42} color="#fff" />
            </View>
        </TouchableOpacity>
    );
};

interface MessageBubbleProps {
    item: any;
    isMyMessage: boolean;
    userId: string | null;
    conversation: any;
    onLongPress: (message: any) => void;
    onReactionToggle: (messageId: string, emoji: string) => void;
    onMediaPress: (media: { type: string; url: string }) => void;
    showAvatar: boolean;
    isGroup: boolean;
    isLastInSequence: boolean;
}

const MessageBubble = ({ 
    item, 
    isMyMessage, 
    userId, 
    conversation, 
    onLongPress, 
    onReactionToggle,
    onMediaPress,
    showAvatar,
    isGroup,
    isLastInSequence
}: MessageBubbleProps) => {
    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isRecalled = item.isRecalled;
    const isDeleted = item.deletedForEveryone;

    const renderAttachment = () => {
        const attachments = item.metadata?.attachments || item.attachments || [];
        if (attachments.length === 0) return null;

        return (
            <View style={styles.attachmentsGrid}>
                {attachments.map((attachment: any, index: number) => {
                    const fullUrl = `${API_CONFIG.BASE_URL}${attachment.url}`;
                    const type = attachment.type || (attachment.mimetype?.startsWith("image") ? "image" : attachment.mimetype?.startsWith("video") ? "video" : "file");

                    if (type === "image") {
                        return (
                            <TouchableOpacity 
                                key={index}
                                onPress={() => onMediaPress({ type: "image", url: fullUrl })}
                                onLongPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    onLongPress(item);
                                }}
                                delayLongPress={300}
                                style={attachments.length > 1 ? styles.gridItem : null}
                            >
                                <ExpoImage 
                                    source={{ uri: fullUrl }} 
                                    style={attachments.length > 1 ? styles.gridImage : styles.messageImage} 
                                    contentFit="cover"
                                    transition={200}
                                />
                            </TouchableOpacity>
                        );
                    }

                    if (type === "video") {
                        return (
                            <VideoAttachment 
                                key={index}
                                url={fullUrl}
                                isGrid={attachments.length > 1}
                                onLongPress={onLongPress}
                                item={item}
                                onPress={() => onMediaPress({ type: "video", url: fullUrl })}
                            />
                        );
                    }

                    return (
                        <TouchableOpacity 
                            key={index} 
                            style={[styles.fileContainer, attachments.length > 1 && styles.gridItem]} 
                            onPress={() => {/* Linking.openURL(fullUrl) */}}
                        >
                            <View style={styles.fileIcon}>
                                <Ionicons name="document-text" size={24} color={ChatColors.primary} />
                            </View>
                            <View style={styles.fileInfo}>
                                <Text style={styles.fileName} numberOfLines={1}>{attachment.filename || "Tài liệu"}</Text>
                                <Text style={styles.fileSize}>
                                    {attachment.size ? (attachment.size / 1024 / 1024).toFixed(2) + " MB" : ""}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    if (item.type === "system") {
        return (
            <View style={styles.systemMessageContainer}>
                <Text style={styles.systemMessageText}>{item.content}</Text>
            </View>
        );
    }

    return (
        <View style={[
            styles.messageWrapper, 
            isMyMessage ? styles.myMessageWrapper : styles.theirMessageWrapper,
            !isLastInSequence && { marginBottom: 2 }
        ]}>
            {!isMyMessage && (
                <View style={styles.avatarSpacer}>
                    {showAvatar && (
                        <ExpoImage 
                            source={item.senderAvatar ? { uri: item.senderAvatar } : require("../../assets/images/user-avatar.jpg")} 
                            style={styles.messageAvatar} 
                            contentFit="cover"
                        />
                    )}
                </View>
            )}

            <View style={[styles.messageBubbleContainer, isMyMessage ? { alignItems: "flex-end" } : { alignItems: "flex-start" }]}>
                {isGroup && !isMyMessage && showAvatar && (
                    <Text style={styles.senderName}>{item.senderName || "Người dùng"}</Text>
                )}

                {item.replyToId && (
                    <View style={[styles.replyContainer, isMyMessage ? styles.myReplyContainer : styles.theirReplyContainer]}>
                        <View style={styles.replyBar} />
                        <View style={styles.replyContent}>
                            <Text style={styles.replyName} numberOfLines={1}>
                                {item.repliedMessage?.senderName || "Phản hồi"}
                            </Text>
                            <Text style={styles.replyText} numberOfLines={1}>
                                {item.repliedMessage?.content || "Phương tiện"}
                            </Text>
                        </View>
                    </View>
                )}

                <TouchableOpacity 
                    onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onLongPress(item);
                    }}
                    delayLongPress={300}
                    activeOpacity={0.9}
                    style={[
                        styles.messageBubble, 
                        isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble,
                        (item.type === "image" || item.type === "video") && !isRecalled && !isDeleted && styles.mediaBubble,
                        (isRecalled || isDeleted) && styles.recalledBubble,
                        !isLastInSequence && (isMyMessage ? styles.myBubbleMiddle : styles.theirBubbleMiddle)
                    ]}
                >
                    {isMyMessage && !isRecalled && !isDeleted && (
                        <LinearGradient
                            colors={["#FF4B3A", "#FF6B5A"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    )}

                    {(!isRecalled && !isDeleted) && renderAttachment()}

                    {isRecalled ? (
                        <View style={styles.recalledContent}>
                            <Ionicons name="refresh-circle-outline" size={16} color="#888" />
                            <Text style={[styles.messageText, styles.recalledText]}>
                                {isMyMessage ? "Bạn đã thu hồi tin nhắn" : "Tin nhắn đã bị thu hồi"}
                            </Text>
                        </View>
                    ) : isDeleted ? (
                        <View style={styles.recalledContent}>
                            <Ionicons name="trash-outline" size={16} color="#888" />
                            <Text style={[styles.messageText, styles.recalledText]}>
                                Tin nhắn đã bị xóa
                            </Text>
                        </View>
                    ) : item.type === "voice" ? (
                        <VoicePlayer 
                            url={`${API_CONFIG.BASE_URL}${item.attachments?.[0]?.url || item.metadata?.attachments?.[0]?.url}`} 
                            duration={item.metadata?.durationSeconds} 
                            isMyMessage={isMyMessage}
                        />
                    ) : item.content ? (
                        <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.theirMessageText]}>
                            {item.content}
                        </Text>
                    ) : null}

                    <View style={styles.messageFooter}>
                        <Text style={[styles.messageTime, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>
                            {time}
                        </Text>
                        {isMyMessage && (
                            <Ionicons 
                                name={(item.status === "seen" || item.isRead) ? "checkmark-done" : (item.status === "delivered" ? "checkmark-done" : "checkmark")} 
                                size={14} 
                                color={(item.status === "seen" || item.isRead) ? "#4fc3f7" : "rgba(255,255,255,0.7)"} 
                                style={{ marginLeft: 4 }}
                            />
                        )}
                    </View>
                </TouchableOpacity>

                {item.reactions && item.reactions.length > 0 && (
                    <View style={[styles.reactionsContainer, isMyMessage ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                        {(() => {
                            const grouped = item.reactions.reduce((acc: any, r: any) => {
                                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                return acc;
                            }, {});
                            
                            return Object.entries(grouped).map(([emoji, count]: any) => (
                                <Pressable 
                                    key={emoji} 
                                    style={[
                                        styles.reactionBadge,
                                        item.reactions.some((r: any) => r.userId === userId && r.emoji === emoji) && styles.myReactionBadge
                                    ]}
                                    onPress={() => onReactionToggle(item.messageId, emoji)}
                                >
                                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                                    {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                                </Pressable>
                            ));
                        })()}
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    messageWrapper: { 
        flexDirection: "row", 
        marginBottom: 8, 
        alignItems: "flex-end",
        paddingHorizontal: 12
    },
    myMessageWrapper: { justifyContent: "flex-end" },
    theirMessageWrapper: { justifyContent: "flex-start" },
    avatarSpacer: {
        width: 30,
        marginRight: 8,
    },
    messageAvatar: { 
        width: 30, 
        height: 30, 
        borderRadius: 15, 
        backgroundColor: "#f0f0f0"
    },
    messageBubbleContainer: { maxWidth: "80%" },
    senderName: { fontSize: 11, color: "#8E8E93", marginLeft: 4, marginBottom: 2 },
    messageBubble: { 
        paddingHorizontal: 16, 
        paddingVertical: 12, 
        borderRadius: 20,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    myMessageBubble: { 
        backgroundColor: ChatColors.primary,
        borderBottomRightRadius: 4,
    },
    theirMessageBubble: { 
        backgroundColor: "#fff", 
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: "#f2f2f7"
    },
    myBubbleMiddle: {
        borderBottomRightRadius: 20,
        borderTopRightRadius: 4,
    },
    theirBubbleMiddle: {
        borderBottomLeftRadius: 20,
        borderTopLeftRadius: 4,
    },
    mediaBubble: { padding: 4, borderRadius: 16 },
    recalledBubble: { backgroundColor: "#f2f2f7", borderWidth: 0 },
    messageText: { fontSize: 16, lineHeight: 22 },
    myMessageText: { color: "#fff" },
    theirMessageText: { color: "#1c1c1e" },
    recalledContent: { flexDirection: "row", alignItems: "center", gap: 6 },
    recalledText: { fontStyle: "italic", color: "#8e8e93", fontSize: 14 },
    messageFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
    messageTime: { fontSize: 10 },
    myMessageTime: { color: "rgba(255,255,255,0.7)" },
    theirMessageTime: { color: "#8e8e93" },
    messageImage: { width: width * 0.7, height: width * 0.7, borderRadius: 12 },
    videoContainer: { 
        width: width * 0.7, 
        height: width * 0.5, 
        borderRadius: 12, 
        overflow: "hidden", 
        backgroundColor: "#000", 
        justifyContent: "center", 
        alignItems: "center" 
    },
    messageVideo: { width: "100%", height: "100%" },
    videoPlayOverlay: { position: "absolute", zIndex: 1 },
    systemMessageContainer: { 
        alignSelf: "center", 
        backgroundColor: "rgba(0,0,0,0.05)", 
        paddingHorizontal: 16, 
        paddingVertical: 6, 
        borderRadius: 20, 
        marginVertical: 12 
    },
    systemMessageText: { fontSize: 12, color: "#8e8e93", fontWeight: "500" },
    fileContainer: { 
        flexDirection: "row", 
        alignItems: "center", 
        backgroundColor: "#f8f8f8", 
        padding: 12, 
        borderRadius: 12, 
        minWidth: width * 0.6 
    },
    fileIcon: { 
        width: 44, 
        height: 44, 
        borderRadius: 10, 
        backgroundColor: "#fff", 
        justifyContent: "center", 
        alignItems: "center", 
        marginRight: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2
    },
    fileInfo: { flex: 1 },
    fileName: { fontSize: 15, fontWeight: "600", color: "#1c1c1e" },
    fileSize: { fontSize: 12, color: "#8e8e93", marginTop: 2 },
    attachmentsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    gridItem: { width: "48%", aspectRatio: 1 },
    gridImage: { width: "100%", height: "100%", borderRadius: 8 },
    replyContainer: { 
        backgroundColor: "rgba(0,0,0,0.03)", 
        borderTopLeftRadius: 12, 
        borderTopRightRadius: 12, 
        flexDirection: "row", 
        marginBottom: -8, 
        paddingBottom: 8, 
        overflow: "hidden",
        width: "100%"
    },
    myReplyContainer: { backgroundColor: "rgba(255,255,255,0.15)" },
    theirReplyContainer: { backgroundColor: "#f2f2f7" },
    replyBar: { width: 3, backgroundColor: ChatColors.primary },
    replyContent: { padding: 8, flex: 1 },
    replyName: { fontWeight: "bold", fontSize: 12, color: ChatColors.primary },
    replyText: { fontSize: 12, color: "#3a3a3c" },
    reactionsContainer: { 
        flexDirection: "row", 
        flexWrap: "wrap", 
        marginTop: -10, 
        marginHorizontal: 4, 
        zIndex: 5 
    },
    reactionBadge: { 
        flexDirection: "row", 
        alignItems: "center", 
        backgroundColor: "#fff", 
        borderRadius: 15, 
        paddingHorizontal: 8, 
        paddingVertical: 3, 
        marginRight: 4, 
        marginBottom: 4, 
        elevation: 3, 
        shadowColor: "#000", 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.15, 
        shadowRadius: 3, 
        borderWidth: 1, 
        borderColor: "#f2f2f7" 
    },
    myReactionBadge: { 
        borderColor: ChatColors.primary, 
        backgroundColor: "#fff5f5" 
    },
    reactionEmoji: { fontSize: 14 },
    reactionCount: { fontSize: 12, marginLeft: 4, color: "#3a3a3c", fontWeight: "700" },
});

export default MessageBubble;

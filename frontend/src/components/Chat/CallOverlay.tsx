import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Animated, Dimensions, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import SocketService from "../../services/socketService";
import ChatApi from "../../services/chatApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let mediaDevices: any;
let RTCView: any;

if (!isExpoGo) {
    try {
        const WebRTC = require("react-native-webrtc");
        RTCPeerConnection = WebRTC.RTCPeerConnection;
        RTCIceCandidate = WebRTC.RTCIceCandidate;
        RTCSessionDescription = WebRTC.RTCSessionDescription;
        mediaDevices = WebRTC.mediaDevices;
        RTCView = WebRTC.RTCView;
    } catch (e) {
        console.warn("WebRTC native modules not found. Voice/Video calls disabled.");
    }
}

import { useCall } from "../../contexts/CallContext";

const CallOverlay = () => {
    const { incomingCall, activeCall, setIncomingCall, setActiveCall, cleanupCall: contextCleanup } = useCall();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [localStream, setLocalStream] = useState<any>(null);
    const [remoteStreams, setRemoteStreams] = useState<{ [userId: string]: any }>({});
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isFrontCamera, setIsFrontCamera] = useState(true);
    
    const [callStatus, setCallStatus] = useState<"ringing" | "connecting" | "connected">("ringing");
    const [callDuration, setCallDuration] = useState(0);

    const pcRefs = useRef<{ [userId: string]: any }>({});
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const loadUser = async () => {
            const userData = await AsyncStorage.getItem("user_data");
            if (userData) setCurrentUser(JSON.parse(userData));
        };
        loadUser();

        if (incomingCall) {
            startPulse();
            Vibration.vibrate([1000, 2000], true); 
        } else {
            Vibration.cancel();
        }

        if (activeCall && activeCall.isInitiator && callStatus === "ringing") {
            ringingTimeoutRef.current = setTimeout(() => {
                handleEndCall();
            }, 30000);
        } else if (incomingCall) {
            ringingTimeoutRef.current = setTimeout(() => {
                handleReject();
            }, 30000);
        }

        const handleOffer = async (data: any) => {
            if (isExpoGo) return;
            console.log("[CallOverlay] Received offer from:", data.fromUserId);
            await handleOfferSignal(data.offer, data.fromUserId);
        };

        const handleAnswer = async (data: any) => {
            if (isExpoGo) return;
            console.log("[CallOverlay] Received answer from:", data.fromUserId || data.recipientId);
            await handleAnswerSignal(data.answer, data.fromUserId || data.recipientId);
        };

        const handleCandidate = async (data: any) => {
            if (isExpoGo) return;
            console.log("[CallOverlay] Received ice_candidate from:", data.fromUserId);
            
            const candidatePayload = typeof data.candidate === 'object' && data.candidate !== null
                ? data.candidate
                : {
                    candidate: data.candidate,
                    sdpMLineIndex: data.sdpMLineIndex !== undefined ? data.sdpMLineIndex : 0,
                    sdpMid: data.sdpMid || "0"
                };

            await handleCandidateSignal(candidatePayload, data.fromUserId);
        };

        SocketService.on("offer", handleOffer);
        SocketService.on("answer", handleAnswer);
        SocketService.on("ice_candidate", handleCandidate);

        return () => {
            SocketService.off("offer", handleOffer);
            SocketService.off("answer", handleAnswer);
            SocketService.off("ice_candidate", handleCandidate);
            Vibration.cancel();
            if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        };
    }, [currentUser, incomingCall, activeCall]);

    useEffect(() => {
        if (callStatus === "connected") {
            timerIntervalRef.current = setInterval(() => {
                setCallDuration((prev) => prev + 1);
            }, 1000);
        } else {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        }

        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [callStatus]);

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, "0");
        const s = (seconds % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    const getOrCreateLocalStream = async (isVideo: boolean) => {
        if (localStream) return localStream;
        const constraints = {
            audio: true,
            video: isVideo ? { facingMode: "user" } : false
        };
        try {
            const stream = await mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            return stream;
        } catch (error: any) {
            console.error("[CallOverlay] Failed to get local stream:", error);
            if (isVideo) {
                console.log("[CallOverlay] Falling back to audio only...");
                try {
                    const fallbackStream = await mediaDevices.getUserMedia({ audio: true, video: false });
                    setLocalStream(fallbackStream);
                    Alert.alert(
                        "Lỗi Camera", 
                        "Không tìm thấy Camera trên máy của bạn (hoặc máy ảo chưa bật Camera). Bạn vẫn có thể nói chuyện bằng âm thanh và xem video của người kia."
                    );
                    return fallbackStream;
                } catch (fallbackErr) {
                    console.error("[CallOverlay] Audio fallback failed:", fallbackErr);
                    return null;
                }
            }
            return null;
        }
    };

    const createPeerConnection = async (targetId: string, isVideo: boolean) => {
        if (isExpoGo || !RTCPeerConnection || !targetId) return null;
        if (pcRefs.current[targetId]) return pcRefs.current[targetId]; // Already exists
        
        console.log(`[CallOverlay] Creating PC for target: ${targetId}`);
        const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
        const pc = new RTCPeerConnection(configuration);
        pcRefs.current[targetId] = pc;

        pc.onicecandidate = (event: any) => {
            if (event.candidate) {
                SocketService.emit("ice_candidate", {
                    callId: activeCall?.callId || incomingCall?.callId,
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid
                    },
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    sdpMid: event.candidate.sdpMid,
                    toUserId: targetId,
                    fromUserId: currentUser?.user_id || currentUser?.id
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`[CallOverlay] ICE Connection State [${targetId}]:`, pc.iceConnectionState);
            if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
                setCallStatus("connected");
                if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
            } else if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed" || pc.iceConnectionState === "disconnected") {
                // Remove stream
                setRemoteStreams(prev => {
                    const newStreams = { ...prev };
                    delete newStreams[targetId];
                    return newStreams;
                });
                delete pcRefs.current[targetId];
                if (Object.keys(pcRefs.current).length === 0) {
                    handleEndCall();
                }
            }
        };

        pc.ontrack = (event: any) => {
            console.log(`[CallOverlay] Remote track received from ${targetId}`);
            if (event.streams && event.streams[0]) {
                setRemoteStreams(prev => ({
                    ...prev,
                    [targetId]: event.streams[0]
                }));
            }
        };

        const stream = await getOrCreateLocalStream(isVideo);
        if (stream) {
            stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
        }

        return pc;
    };

    const initiateWebRTC = async (targetId: string, isVideo: boolean) => {
        if (isExpoGo || !targetId) return;
        setCallStatus("connecting");
        const pc = await createPeerConnection(targetId, isVideo);
        if (!pc) return;
        
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            SocketService.emit("offer", {
                callId: activeCall?.callId,
                offer: { type: offer.type, sdp: offer.sdp },
                toUserId: targetId,
                fromUserId: currentUser?.user_id || currentUser?.id
            });
        } catch (err) {
            console.error("[CallOverlay] Failed to initiate WebRTC:", err);
        }
    };

    const handleOfferSignal = async (offer: any, fromId: string) => {
        if (isExpoGo || !fromId) return;
        setCallStatus("connecting");
        const pc = await createPeerConnection(fromId, activeCall?.type === "video");
        if (!pc) return;
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            SocketService.emit("answer", {
                callId: activeCall?.callId || incomingCall?.callId,
                answer: { type: answer.type, sdp: answer.sdp },
                toUserId: fromId,
                fromUserId: currentUser?.user_id || currentUser?.id
            });
        } catch (err) {
            console.error("[CallOverlay] Failed to handle offer:", err);
        }
    };

    const handleAnswerSignal = async (answer: any, fromId: string) => {
        // Find PC by fromId, fallback to first key if not found (for legacy 1-on-1)
        const targetId = fromId || Object.keys(pcRefs.current)[0];
        const pc = pcRefs.current[targetId];
        
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (err) {
                console.error("[CallOverlay] Failed to set remote desc:", err);
            }
        }
    };

    const handleCandidateSignal = async (candidate: any, fromId: string) => {
        const targetId = fromId || Object.keys(pcRefs.current)[0];
        const pc = pcRefs.current[targetId];

        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error("[CallOverlay] Failed to add ICE candidate:", err);
            }
        }
    };

    const cleanupCall = () => {
        Vibration.cancel();
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        
        // Close all peer connections
        Object.values(pcRefs.current).forEach((pc: any) => {
            try { pc.close(); } catch(e) {}
        });
        pcRefs.current = {};
        
        if (localStream) {
            localStream.getTracks().forEach((track: any) => track.stop());
            setLocalStream(null);
        }
        setRemoteStreams({});
        setIsMuted(false);
        setIsVideoOff(false);
        setIsFrontCamera(true);
        setCallStatus("ringing");
        setCallDuration(0);
        contextCleanup();
    };

    useEffect(() => {
        if (activeCall && activeCall.isInitiator && Object.keys(pcRefs.current).length === 0 && callStatus === "ringing") {
            console.log("[CallOverlay] Call accepted, initiating WebRTC offer...");
            
            // Check if group call
            if (activeCall.isGroupCall && activeCall.participantIds && activeCall.participantIds.length > 0) {
                activeCall.participantIds.forEach((pId: string) => {
                    const currentId = String(currentUser?.user_id || currentUser?.id);
                    if (String(pId) !== currentId) {
                        initiateWebRTC(pId, activeCall.type === "video");
                    }
                });
            } else {
                initiateWebRTC(activeCall.recipientId, activeCall.type === "video");
            }
        }
    }, [activeCall, callStatus, currentUser]);

    const startPulse = () => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        ).start();
    };

    const handleAccept = async () => {
        if (!incomingCall) return;
        Vibration.cancel();
        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        
        try {
            await ChatApi.acceptCall(incomingCall.callId);
            setIncomingCall(null);
            setActiveCall(incomingCall);
        } catch (error) {
            console.error("Failed to accept call:", error);
        }
    };

    const handleReject = async () => {
        if (!incomingCall) return;
        try {
            await ChatApi.rejectCall(incomingCall.callId);
            cleanupCall();
        } catch (error) {
            console.error("Failed to reject call:", error);
        }
    };

    const handleEndCall = async () => {
        if (!activeCall && !incomingCall) return;
        const targetId = activeCall?.callId || activeCall?.id || activeCall?.call_id || incomingCall?.callId || incomingCall?.call_id;
        try {
            await ChatApi.endCall(targetId);
            cleanupCall();
        } catch (error) {
            console.error("Failed to end call:", error);
            cleanupCall();
        }
    };

    const toggleMute = () => {
        if (localStream) {
            const newMutedState = !isMuted;
            localStream.getAudioTracks().forEach((track: any) => {
                track.enabled = !newMutedState;
            });
            setIsMuted(newMutedState);
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const newVideoState = !isVideoOff;
            localStream.getVideoTracks().forEach((track: any) => {
                track.enabled = !newVideoState;
            });
            setIsVideoOff(newVideoState);
        }
    };

    const toggleCamera = () => {
        if (localStream) {
            localStream.getVideoTracks().forEach((track: any) => {
                if (typeof track._switchCamera === "function") {
                    track._switchCamera();
                }
            });
            setIsFrontCamera(!isFrontCamera);
        }
    };

    if (!incomingCall && !activeCall) return null;

    // Logic to render grid
    const renderRemoteStreams = () => {
        const streams = Object.values(remoteStreams);
        if (streams.length === 0) {
            return (
                <Image 
                    source={activeCall?.callerAvatar ? { uri: activeCall.callerAvatar } : require("../../assets/images/user-avatar.jpg")} 
                    style={styles.largeAvatar} 
                />
            );
        }

        if (streams.length === 1) {
            return RTCView ? (
                <RTCView 
                    streamURL={streams[0].toURL()} 
                    style={styles.remoteVideoFull} 
                    objectFit="cover" 
                />
            ) : (
                <View style={[styles.remoteVideoFull, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: 'white' }}>Video stream not supported</Text>
                </View>
            );
        }

        // 2 streams = split horizontally
        if (streams.length === 2) {
            return (
                <View style={styles.gridContainer}>
                    {streams.map((stream, idx) => (
                        <View key={idx} style={styles.gridCell2}>
                            {RTCView ? (
                                <RTCView streamURL={stream.toURL()} style={styles.remoteVideoFull} objectFit="cover" />
                            ) : (
                                <View style={[styles.remoteVideoFull, { justifyContent: 'center', alignItems: 'center' }]}>
                                    <Text style={{ color: 'white' }}>Video stream not supported</Text>
                                </View>
                            )}
                        </View>
                    ))}
                </View>
            );
        }

        // 3-4 streams = 2x2 grid
        return (
            <View style={styles.gridContainer}>
                {streams.slice(0,4).map((stream, idx) => (
                    <View key={idx} style={styles.gridCell4}>
                        {RTCView ? (
                            <RTCView streamURL={stream.toURL()} style={styles.remoteVideoFull} objectFit="cover" />
                        ) : (
                            <View style={[styles.remoteVideoFull, { justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ color: 'white' }}>Video not supported</Text>
                            </View>
                        )}
                    </View>
                ))}
            </View>
        );
    };

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Incoming Call Modal */}
            <Modal visible={!!incomingCall} transparent animationType="slide">
                <View style={styles.overlay}>
                    <View style={styles.callCard}>
                        <Animated.View style={[styles.avatarContainer, { transform: [{ scale: pulseAnim }] }]}>
                            <Image 
                                source={incomingCall?.callerAvatar ? { uri: incomingCall.callerAvatar } : require("../../assets/images/user-avatar.jpg")} 
                                style={styles.avatar} 
                            />
                        </Animated.View>
                        <Text style={styles.callerName}>{incomingCall?.groupName || incomingCall?.callerName || "Cuộc gọi đến"}</Text>
                        <Text style={styles.callType}>
                            {incomingCall?.isGroupCall ? "Cuộc gọi nhóm đến..." :
                             incomingCall?.type === "video" ? "Cuộc gọi video đến..." : "Cuộc gọi thoại đến..."}
                        </Text>
                        
                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={handleReject}>
                                <Ionicons name="close" size={30} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={handleAccept}>
                                <Ionicons name={incomingCall?.type === "video" ? "videocam" : "call"} size={30} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Active Call Modal */}
            <Modal visible={!!activeCall} transparent animationType="fade">
                <View style={[styles.overlay, { backgroundColor: "#1a1a1a" }]}>
                    {isExpoGo ? (
                        <View style={styles.activeCallContainer}>
                            <Ionicons name="warning" size={50} color="#FF4B3A" />
                            <Text style={[styles.activeCallerName, { marginTop: 20 }]}>Tính năng không hỗ trợ</Text>
                            <Text style={[styles.activeTimer, { textAlign: "center", paddingHorizontal: 40 }]}>
                                Tính năng gọi Voice/Video yêu cầu Development Build. Expo Go không hỗ trợ Native Modules WebRTC.
                            </Text>
                            <TouchableOpacity style={[styles.activeBtn, styles.endCallBtn]} onPress={handleEndCall}>
                                <Ionicons name="close" size={30} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.activeCallContainer}>
                            {/* Remote Streams Grid */}
                            {activeCall?.type === "video" ? renderRemoteStreams() : (
                                <Image 
                                    source={activeCall?.callerAvatar ? { uri: activeCall.callerAvatar } : require("../../assets/images/user-avatar.jpg")} 
                                    style={styles.largeAvatar} 
                                />
                            )}

                            {/* Local Stream (PIP) */}
                            {activeCall?.type === "video" && localStream && !isVideoOff && (
                                <View style={[styles.localVideoContainer, styles.localVideoShadow]}>
                                    {RTCView ? (
                                        <RTCView 
                                            streamURL={localStream.toURL()} 
                                            style={styles.localVideo} 
                                            objectFit="cover" 
                                            mirror={isFrontCamera}
                                        />
                                    ) : (
                                        <View style={[styles.localVideo, { justifyContent: 'center', alignItems: 'center' }]}>
                                            <Ionicons name="videocam-off" size={30} color="#666" />
                                        </View>
                                    )}
                                    <TouchableOpacity style={styles.flipCameraBtn} onPress={toggleCamera}>
                                        <Ionicons name="camera-reverse" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            )}

                            <View style={[styles.callDetails, Object.keys(remoteStreams).length > 0 && activeCall?.type === "video" ? styles.callDetailsTop : null]}>
                                <Text style={styles.activeCallerName}>{activeCall?.groupName || activeCall?.callerName || "Đang trong cuộc gọi"}</Text>
                                <Text style={styles.activeTimer}>
                                    {callStatus === "ringing" ? "Đang đổ chuông..." : 
                                     callStatus === "connecting" ? "Đang kết nối..." :
                                     formatDuration(callDuration)}
                                </Text>
                            </View>
                            
                            {/* Controls */}
                            <View style={styles.activeActions}>
                                <TouchableOpacity style={[styles.activeBtn, isMuted && styles.activeBtnOff]} onPress={toggleMute}>
                                    <Ionicons name={isMuted ? "mic-off" : "mic"} size={24} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.activeBtn, styles.endCallBtn]} onPress={handleEndCall}>
                                    <Ionicons name="call-outline" size={30} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                                </TouchableOpacity>
                                {activeCall?.type === "video" && (
                                    <TouchableOpacity style={[styles.activeBtn, isVideoOff && styles.activeBtnOff]} onPress={toggleVideo}>
                                        <Ionicons name={isVideoOff ? "videocam-off" : "videocam"} size={24} color="#fff" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
    callCard: { backgroundColor: "#fff", width: "85%", borderRadius: 30, padding: 30, alignItems: "center" },
    avatarContainer: { marginBottom: 20 },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    callerName: { fontSize: 22, fontWeight: "bold", color: "#333", marginBottom: 10 },
    callType: { fontSize: 16, color: "#666", marginBottom: 30 },
    actionButtons: { flexDirection: "row", justifyContent: "space-around", width: "100%" },
    btn: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", elevation: 5 },
    rejectBtn: { backgroundColor: "#ff4d4d" },
    acceptBtn: { backgroundColor: "#4CAF50" },
    
    activeCallContainer: { flex: 1, justifyContent: "center", alignItems: "center", width: "100%" },
    remoteVideoFull: { width: "100%", height: "100%", position: "absolute" },
    gridContainer: { flex: 1, width: "100%", flexDirection: "row", flexWrap: "wrap" },
    gridCell2: { width: "100%", height: "50%", borderBottomWidth: 1, borderColor: "#000" },
    gridCell4: { width: "50%", height: "50%", borderWidth: 0.5, borderColor: "#000" },

    localVideoContainer: { position: "absolute", bottom: 120, right: 20, width: 110, height: 160, borderRadius: 16, overflow: "hidden", borderWidth: 2, borderColor: "#fff", backgroundColor: "#111", zIndex: 10 },
    localVideoShadow: { elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 5 },
    localVideo: { width: "100%", height: "100%" },
    flipCameraBtn: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.6)", width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
    
    callDetails: { position: "absolute", top: height * 0.4, alignItems: "center", zIndex: 5 },
    callDetailsTop: { top: 60, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    largeAvatar: { width: 150, height: 150, borderRadius: 75, marginBottom: 20, borderWidth: 3, borderColor: "#FF4B3A" },
    activeCallerName: { fontSize: 24, fontWeight: "bold", color: "#fff", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 },
    activeTimer: { fontSize: 18, color: "rgba(255,255,255,0.9)", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 },
    
    activeActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", width: "80%", position: "absolute", bottom: 40, zIndex: 10 },
    activeBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
    activeBtnOff: { backgroundColor: "#FF4B3A", borderColor: "#FF4B3A" },
    endCallBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#FF4B3A", elevation: 5 },
});

export default CallOverlay;

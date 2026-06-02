    import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import SocketService from "../services/socketService";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface CallContextType {
    incomingCall: any;
    activeCall: any;
    setIncomingCall: (call: any) => void;
    setActiveCall: (call: any) => void;
    cleanupCall: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const [activeCall, setActiveCall] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        const loadUser = async () => {
            const userData = await AsyncStorage.getItem("user_data");
            if (userData) {
                const parsed = JSON.parse(userData);
                setCurrentUser(parsed);
            }
        };
        loadUser();

        const handleIncomingCall = (data: any) => {
            console.log("[CallProvider] Incoming call:", data);
            
            const currentUserId = currentUser?.user_id || currentUser?.id;
            const callerId = data.callerId || data.initiator_id || data.fromUserId;
            
            // Don't show if I'm the caller
            if (callerId === currentUserId) return;
            
            setIncomingCall({
                callId: data.callId || data.id,
                callerId: callerId,
                callerName: data.callerName || data.caller_name || "Unknown",
                callerAvatar: data.callerAvatar || data.caller_avatar,
                type: data.callType || data.call_type || "voice",
                conversationId: data.conversationId || data.conversation_id,
                isGroupCall: data.isGroupCall || false,
                groupName: data.groupName || data.group_name,
                groupAvatar: data.groupAvatar || data.group_avatar,
                participantIds: data.participantIds || data.participant_ids,
            });
        };

        const handleCallAccepted = (data: any) => {
            console.log("[CallProvider] Call accepted:", data);
            setIncomingCall(null);
            setActiveCall({
                callId: data.callId || data.id,
                recipientId: data.recipientId || data.userId,
                callerName: data.recipientName || data.recipient_name,
                callerAvatar: data.recipientAvatar || data.recipient_avatar,
                type: data.callType || data.call_type || (activeCall ? activeCall.type : "voice"),
                isGroupCall: activeCall?.isGroupCall || data.isGroupCall || false,
                groupName: activeCall?.groupName || data.groupName || data.group_name,
                groupAvatar: activeCall?.groupAvatar || data.groupAvatar || data.group_avatar,
                participantIds: activeCall?.participantIds || data.participantIds || data.participant_ids,
                isInitiator: true // Since we received call_accepted, we are the initiator
            });
        };

        const handleCallRejected = (data: any) => {
            console.log("[CallProvider] Call rejected:", data);
            cleanupCall();
        };

        const handleCallEnded = () => {
            console.log("[CallProvider] Call ended/cancelled");
            cleanupCall();
        };

        SocketService.on("incoming_call", handleIncomingCall);
        SocketService.on("call_accepted", handleCallAccepted);
        SocketService.on("call_rejected", handleCallRejected);
        SocketService.on("cancel_call", handleCallEnded);
        SocketService.on("call_cancelled", handleCallEnded);
        SocketService.on("call_ended", handleCallEnded);

        return () => {
            SocketService.off("incoming_call", handleIncomingCall);
            SocketService.off("call_accepted", handleCallAccepted);
            SocketService.off("call_rejected", handleCallRejected);
            SocketService.off("cancel_call", handleCallEnded);
            SocketService.off("call_cancelled", handleCallEnded);
            SocketService.off("call_ended", handleCallEnded);
        };
    }, [currentUser, activeCall]);

    const cleanupCall = () => {
        setIncomingCall(null);
        setActiveCall(null);
    };

    return (
        <CallContext.Provider value={{ incomingCall, activeCall, setIncomingCall, setActiveCall, cleanupCall }}>
            {children}
        </CallContext.Provider>
    );
};

export const useCall = () => {
    const context = useContext(CallContext);
    if (context === undefined) {
        throw new Error("useCall must be used within a CallProvider");
    }
    return context;
};

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import SocketService from "../services/socketService";
import { useAuth } from "./AuthContext";

interface SocketContextType {
    socket: typeof SocketService;
    isConnected: boolean;
    onlineUsers: Record<string, boolean>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let isMounted = true;

        const handleUserStatusChanged = (data: { userId: string, isOnline: boolean }) => {
            if (!isMounted) return;
            setOnlineUsers(prev => ({
                ...prev,
                [data.userId]: data.isOnline
            }));
        };

        if (isAuthenticated && user) {
            console.log("[SocketProvider] Authenticated, connecting socket...");
            SocketService.connect().then(() => {
                SocketService.on("user_status_changed", handleUserStatusChanged);
            });
        } else {
            console.log("[SocketProvider] Unauthenticated, disconnecting socket...");
            SocketService.disconnect();
        }

        return () => {
            isMounted = false;
            SocketService.off("user_status_changed", handleUserStatusChanged);
        };
    }, [isAuthenticated, user]);

    return (
        <SocketContext.Provider value={{ socket: SocketService, isConnected: SocketService.isConnected(), onlineUsers }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (context === undefined) {
        throw new Error("useSocket must be used within a SocketProvider");
    }
    return context;
};

export default SocketContext;

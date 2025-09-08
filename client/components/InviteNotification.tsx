import { useState, useEffect } from "react";
import { useStore } from "../store/useStore";
import { toast } from "react-hot-toast";

interface InviteData {
  inviter: {
    id: string;
    username: string;
    email: string;
    avatarurl: string;
  };
  inviterId: string;
  inviteId: string;
}

export const InviteNotification = () => {
  const [pendingInvite, setPendingInvite] = useState<InviteData | null>(null);
  const [closing, setClosing] = useState(false);
  const socket = useStore((state) => state.socket);
  const dismiss = () => {
    setClosing(true);
    setTimeout(() => { setPendingInvite(null); setClosing(false); }, 180);
  };

  useEffect(() => {
    if (!socket) return;

    const handleReceiveInvite = (data: InviteData) => {
      console.log("📨 INVITE COMPONENT: Received invite:", data);
      // If we already have this exact invite ignore duplicate
      setPendingInvite(prev => {
        if (prev?.inviteId === data.inviteId) return prev;
        return data;
      });
      
      // Show toast notification
      toast.success(`🎮 ${data.inviter.username} invited you to play Pong!`, {
        duration: 4000,
      });
      // Auto-dismiss after 25s if untouched
      setTimeout(() => {
        setPendingInvite(p => p && p.inviteId === data.inviteId ? null : p);
      }, 25000);
    };

    const clearIfMatches = (inviterId: string, reason: string, inviteId?: string) => {
      setPendingInvite(p => {
        if (p && p.inviterId === inviterId && (!inviteId || p.inviteId === inviteId)) {
          console.log(`🔔 INVITE COMPONENT: Clearing invite due to ${reason} (inviteId=${inviteId || 'NA'})`);
          return null;
        }
        return p;
      });
    };

    const handleInviteConsumed = (payload: { inviterId?: string; by?: string; inviteId?: string }) => {
      if (pendingInvite) clearIfMatches(payload.inviterId || payload.by || pendingInvite.inviterId, 'consumed', payload.inviteId);
    };
    const handleInviteCleared = (payload?: { inviteId?: string }) => {
      if (pendingInvite) clearIfMatches(pendingInvite.inviterId, 'cleared', payload?.inviteId);
    };

    console.log("📨 INVITE COMPONENT: Setting up receive_invite listener");
    socket.on("receive_invite", handleReceiveInvite);
    socket.on("invite_consumed", handleInviteConsumed);
    socket.on("invite_cleared", handleInviteCleared);

    return () => {
      console.log("📨 INVITE COMPONENT: Cleaning up receive_invite listener");
      socket.off("receive_invite", handleReceiveInvite);
      socket.off("invite_consumed", handleInviteConsumed);
      socket.off("invite_cleared", handleInviteCleared);
    };
  }, [socket, pendingInvite]);

  const handleAccept = () => {
  if (!pendingInvite || !socket) return;
  // Prevent double accept across tabs
  setPendingInvite(null);
    
    console.log("✅ INVITE: Accepting invite from:", pendingInvite.inviterId);
    socket.emit("accept_invite", { inviterId: pendingInvite.inviterId });
    toast.success("✅ Invite accepted! Joining game...");
  dismiss();
  };

  const handleDecline = () => {
  if (!pendingInvite || !socket) return;
  setPendingInvite(null);
    
    console.log("❌ INVITE: Declining invite from:", pendingInvite.inviterId);
    socket.emit("decline_invite", { inviterId: pendingInvite.inviterId });
    toast.error("❌ Invite declined");
  dismiss();
  };

  if (!pendingInvite) return null;

  return (
    <div className="fixed z-[9999] bottom-4 right-4 w-72 sm:w-80">
      <div className={`rounded-xl overflow-hidden shadow-2xl ring-1 ring-indigo-500/40 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-gray-700/60 transition-all ${closing ? 'opacity-0 translate-y-2 scale-[0.97]' : 'opacity-100 translate-y-0'} duration-200`}>        
        <div className="p-4 flex gap-3">
          <img
            src={pendingInvite.inviter.avatarurl || '/favicon.ico'}
            alt="avatar"
            className="w-14 h-14 rounded-lg object-cover ring-1 ring-white/10"
          />
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-medium text-white truncate">{pendingInvite.inviter.username}</div>
            <div className="text-xs text-indigo-300/90 font-semibold mb-1">Game Invitation</div>
            <p className="text-xs text-gray-300/90 mb-3 leading-snug">wants to challenge you to a Pong match.</p>
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-white transition-colors"
              >Accept</button>
              <button
                onClick={handleDecline}
                className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-red-500/90 hover:bg-red-500 text-white transition-colors"
              >Decline</button>
              <button
                onClick={dismiss}
                className="px-2 py-1 text-xs rounded-md bg-gray-700/70 hover:bg-gray-700 text-gray-300"
                aria-label="Dismiss"
              >✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

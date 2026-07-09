"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORT_REASON_OPTIONS } from "@ashena/shared";
import { api, type PublicMessageDto } from "@/lib/api";
import { useAuthedObjectUrl, AuthedImg } from "@/components/authed-media";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CHAT_BLOCK_CONFIRM_BODY,
  CHAT_BLOCK_CONFIRM_TITLE,
  CHAT_BLOCK_DONE_MESSAGE,
  CHAT_BLOCK_LABEL,
  CHAT_EMPTY_BODY,
  CHAT_EMPTY_TITLE,
  CHAT_END_CONFIRM_BODY,
  CHAT_END_CONFIRM_TITLE,
  CHAT_END_LABEL,
  CHAT_INPUT_PLACEHOLDER,
  CHAT_MESSAGE_BLOCKED_MESSAGE,
  CHAT_RATE_LIMITED_MESSAGE,
  CHAT_REPORT_LABEL,
  CHAT_REPORT_SUBMITTED_MESSAGE,
  CHAT_REPORT_TITLE,
  CHAT_SEND_LABEL,
  GENERIC_ERROR_MESSAGE,
  LOADING_MESSAGE,
} from "@/lib/copy";
import { ApiError } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;

function useChatMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<PublicMessageDto[]>([]);
  const lastIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setMessages([]);
    lastIdRef.current = undefined;
    if (!sessionId) return;
    let cancelled = false;

    async function poll() {
      if (!sessionId) return;
      try {
        const { messages: fresh } = await api.getMessages(sessionId, lastIdRef.current);
        if (cancelled || fresh.length === 0) return;
        lastIdRef.current = fresh[fresh.length - 1]!.id;
        setMessages((prev) => [...prev, ...fresh]);
      } catch {
        // Best-effort — try again next tick.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  function appendLocal(message: PublicMessageDto) {
    lastIdRef.current = message.id;
    setMessages((prev) => [...prev, message]);
  }

  return { messages, appendLocal };
}

function MessageBubble({ message }: { message: PublicMessageDto }) {
  const mediaUrl = useAuthedObjectUrl(message.type !== "text" ? message.mediaUrl : null);

  return (
    <div className={cn("flex", message.fromSelf ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
          message.fromSelf ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        {message.type === "text" && <p className="whitespace-pre-wrap">{message.text}</p>}
        {message.type === "photo" && (mediaUrl ? <AuthedImg path={message.mediaUrl!} alt="" className="max-h-64 rounded-lg" /> : null)}
        {message.type === "voice" && mediaUrl && <audio controls src={mediaUrl} className="max-w-full" />}
        {message.type === "sticker" && (mediaUrl ? <AuthedImg path={message.mediaUrl!} alt="" className="h-24 w-24" /> : null)}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["activeChat"], queryFn: api.getActiveChat });
  const sessionId = data?.session?.id ?? null;
  const { messages, appendLocal } = useChatMessages(sessionId);

  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const sendTextMutation = useMutation({
    mutationFn: (value: string) => api.sendTextMessage(sessionId!, { text: value }),
    onSuccess: ({ message }) => {
      appendLocal(message);
      setText("");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MESSAGE_BLOCKED") setNotice(CHAT_MESSAGE_BLOCKED_MESSAGE);
      else if (err instanceof ApiError && err.code === "RATE_LIMITED") setNotice(CHAT_RATE_LIMITED_MESSAGE);
      else setNotice(GENERIC_ERROR_MESSAGE);
    },
  });

  const sendMediaMutation = useMutation({
    mutationFn: ({ kind, file, filename }: { kind: "photo" | "voice"; file: File | Blob; filename: string }) =>
      api.sendMediaMessage(sessionId!, kind, file, filename),
    onSuccess: ({ message }) => appendLocal(message),
    onError: () => setNotice(GENERIC_ERROR_MESSAGE),
  });

  const endMutation = useMutation({
    mutationFn: () => api.endChat(sessionId!),
    onSuccess: () => {
      setEndOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["activeChat"] });
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => api.blockChat(sessionId!),
    onSuccess: () => {
      setBlockOpen(false);
      setNotice(CHAT_BLOCK_DONE_MESSAGE);
      void queryClient.invalidateQueries({ queryKey: ["activeChat"] });
    },
  });

  const reportMutation = useMutation({
    mutationFn: (reason: (typeof REPORT_REASON_OPTIONS)[number]["value"]) => api.reportChat(sessionId!, { reason }),
    onSuccess: () => {
      setReportOpen(false);
      setNotice(CHAT_REPORT_SUBMITTED_MESSAGE);
      void queryClient.invalidateQueries({ queryKey: ["activeChat"] });
    },
  });

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      stream.getTracks().forEach((track) => track.stop());
      sendMediaMutation.mutate({ kind: "voice", file: blob, filename: "voice.webm" });
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{LOADING_MESSAGE}</p>;
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center gap-2 p-16 text-center">
        <h2 className="text-lg font-semibold">{CHAT_EMPTY_TITLE}</h2>
        <p className="text-sm text-muted-foreground">{CHAT_EMPTY_BODY}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border p-3">
        <span className="text-sm font-medium">هم‌صحبت</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)}>
            {CHAT_REPORT_LABEL}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBlockOpen(true)}>
            {CHAT_BLOCK_LABEL}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEndOpen(true)}>
            {CHAT_END_LABEL}
          </Button>
        </div>
      </header>

      {notice && <p className="border-b border-border p-2 text-center text-xs text-muted-foreground">{notice}</p>}

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) sendMediaMutation.mutate({ kind: "photo", file, filename: file.name });
            e.target.value = "";
          }}
        />
        <Button type="button" variant="ghost" size="icon" onClick={() => photoInputRef.current?.click()}>
          📷
        </Button>
        <Button
          type="button"
          variant={recording ? "destructive" : "ghost"}
          size="icon"
          onClick={() => (recording ? stopRecording() : void startRecording())}
        >
          🎙️
        </Button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) sendTextMutation.mutate(text.trim());
          }}
          placeholder={CHAT_INPUT_PLACEHOLDER}
          className="h-11 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
        />
        <Button
          type="button"
          disabled={!text.trim() || sendTextMutation.isPending}
          onClick={() => text.trim() && sendTextMutation.mutate(text.trim())}
        >
          {CHAT_SEND_LABEL}
        </Button>
      </div>

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{CHAT_END_CONFIRM_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{CHAT_END_CONFIRM_BODY}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>منصرف شدم</AlertDialogCancel>
            <AlertDialogAction onClick={() => endMutation.mutate()}>{CHAT_END_LABEL}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{CHAT_BLOCK_CONFIRM_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{CHAT_BLOCK_CONFIRM_BODY}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>منصرف شدم</AlertDialogCancel>
            <AlertDialogAction onClick={() => blockMutation.mutate()}>{CHAT_BLOCK_LABEL}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogTitle>{CHAT_REPORT_TITLE}</DialogTitle>
          <div className="flex flex-col gap-2">
            {REPORT_REASON_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                className="justify-start"
                disabled={reportMutation.isPending}
                onClick={() => reportMutation.mutate(option.value)}
              >
                {option.labelFa}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

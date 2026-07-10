"use client";

import { useState, useTransition } from "react";
import { BAN_TYPE_OPTIONS, DEFAULT_BAN_DURATION_DAYS, type BanTypeValue } from "@ashena/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { banUserAction, deleteUserAction, reverseBanAction } from "../actions";

interface UserActionsProps {
  userId: string;
  status: "active" | "banned" | "deleted";
  isAdmin: boolean;
}

/**
 * US-7.4 — ban issuance (both roles), permanent-ban reversal and full
 * account deletion (admin-only — bot-api's own requireAdminRole is the
 * authoritative gate; isAdmin here only controls whether these buttons even
 * render). Every destructive/consequential action confirms via AlertDialog
 * first, per CLAUDE.md's UX tone rule: "sensitive dialogs (ban, end chat,
 * report) spell out consequences explicitly."
 */
export function UserActions({ userId, status, isAdmin }: UserActionsProps) {
  const [banType, setBanType] = useState<BanTypeValue>("temporary");
  const [reason, setReason] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(String(DEFAULT_BAN_DURATION_DAYS));
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <CardTitle>اقدامات</CardTitle>

        {status !== "deleted" ? (
          <div className="flex flex-col gap-3 border-b border-border pb-4">
            <p className="text-sm font-medium text-foreground">صدور بن</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">نوع</Label>
                <select
                  value={banType}
                  onChange={(e) => setBanType(e.target.value as BanTypeValue)}
                  className="h-10 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {BAN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.labelFa}
                    </option>
                  ))}
                </select>
              </div>
              {banType === "temporary" ? (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">مدت (روز)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    className="w-24"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-1">
                <Label className="text-xs">دلیل</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل بن را بنویس" />
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!reason.trim()} className="w-fit">
                  صدور بن
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>این کاربر بن بشه؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    {banType === "permanent"
                      ? "این یه بن دائمه — کاربر دیگه نمی‌تونه از ربات استفاده کنه، مگر با تجدیدنظر از طرف ادمین."
                      : `این کاربر به مدت ${expiresInDays} روز بن می‌شه و بعدش خودکار فعال می‌شه. گفتگوهای فعالش هم بسته می‌شه.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await banUserAction(
                          userId,
                          banType,
                          reason.trim(),
                          banType === "temporary" ? Number(expiresInDays) || DEFAULT_BAN_DURATION_DAYS : undefined,
                        );
                        // Reset the draft — an adversarial review found this
                        // form stays visible after a ban (only hidden once
                        // status is "deleted"), and without this reset a
                        // later re-ban (e.g. after an appeal is denied)
                        // would reopen showing the *previous* ban's reason
                        // and duration rather than a clean form.
                        setReason("");
                        setBanType("temporary");
                        setExpiresInDays(String(DEFAULT_BAN_DURATION_DAYS));
                      })
                    }
                  >
                    تأیید بن
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        {isAdmin && status === "banned" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-fit">
                لغو بن
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>بن این کاربر لغو بشه؟</AlertDialogTitle>
                <AlertDialogDescription>کاربر بلافاصله به حالت فعال برمی‌گرده و می‌تونه دوباره از ربات استفاده کنه.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction disabled={isPending} onClick={() => startTransition(async () => reverseBanAction(userId))}>
                  تأیید لغو بن
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        {isAdmin && status !== "deleted" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-fit">
                حذف کامل حساب
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>حساب این کاربر حذف بشه؟</AlertDialogTitle>
                <AlertDialogDescription>
                  پروفایل کاربر پاک می‌شه و دیگه نمی‌تونه از ربات استفاده کنه. گفتگوهای فعالش هم بسته می‌شه. این کار قابل بازگشت نیست.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction disabled={isPending} onClick={() => startTransition(async () => deleteUserAction(userId))}>
                  تأیید حذف
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}

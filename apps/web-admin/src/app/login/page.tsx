"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [error, formAction, isPending] = useActionState(loginAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base text-foreground">ورود به پنل مدیریت آشنایی</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">نام کاربری</Label>
              <Input id="username" name="username" autoComplete="username" required autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {/* Hide (not just ignore) a stale error while a new submission
                is pending — useActionState's error only updates when the
                action *returns*, and a successful signIn() never does (it
                redirects instead), so without this an old "wrong password"
                message would sit there unchanged through an entire
                in-flight *correct*-credentials retry, reading as if the new
                attempt is also failing. */}
            {error && !isPending ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={isPending}>
              {isPending ? "در حال ورود..." : "ورود"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

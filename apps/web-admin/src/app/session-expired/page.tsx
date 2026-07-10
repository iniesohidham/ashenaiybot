import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BASE_PATH } from "@/lib/base-path";

/**
 * Reached only via lib/admin-api.ts's adminFetch() redirecting here on a
 * 401 from bot-api — see its own comment for why this exists as a distinct
 * page rather than redirecting straight to /login (that would loop, since
 * NextAuth's own cookie is still nominally valid at this point).
 */
export default function SessionExpiredPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base text-foreground">نشستت منقضی شده</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">برای ادامه، دوباره وارد شو.</p>
          <form
            action={async () => {
              "use server";
              // BASE_PATH-prefixed — see login/actions.ts's comment on why a
              // plain "/login" would escape this app entirely.
              await signOut({ redirectTo: `${BASE_PATH}/login` });
            }}
          >
            <Button type="submit" className="w-full">
              ورود دوباره
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

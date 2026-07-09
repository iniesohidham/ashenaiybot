"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { upsertPreferenceSchema, type UpsertPreferenceInput } from "@ashena/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScreenError } from "@/components/screen-error";
import { cn } from "@/lib/utils";
import {
  GENDER_OPTIONS,
  GENERIC_ERROR_MESSAGE,
  LOADING_MESSAGE,
  SETTINGS_AGE_RANGE_LABEL,
  SETTINGS_BLOCKED_EMPTY_MESSAGE,
  SETTINGS_BLOCKED_TITLE,
  SETTINGS_DELETED_MESSAGE,
  SETTINGS_DELETE_ACCOUNT_LABEL,
  SETTINGS_DELETE_CANCEL_LABEL,
  SETTINGS_DELETE_CONFIRM_ACTION_LABEL,
  SETTINGS_DELETE_CONFIRM_BODY,
  SETTINGS_DELETE_CONFIRM_TITLE,
  SETTINGS_GENDER_PREF_LABEL,
  SETTINGS_PREFERENCES_TITLE,
  SETTINGS_SAVED_MESSAGE,
  SETTINGS_SAVE_LABEL,
  SETTINGS_TITLE,
  SETTINGS_UNBLOCK_LABEL,
  SETTINGS_UNBLOCKED_MESSAGE,
} from "@/lib/copy";

function PreferencesCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["preferences"], queryFn: api.getPreferences });
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const { handleSubmit, control, reset } = useForm<UpsertPreferenceInput>({
    resolver: zodResolver(upsertPreferenceSchema),
    defaultValues: { interestedInGenders: [], minAge: 18, maxAge: 99 },
  });

  useEffect(() => {
    if (!data) return;
    reset({ interestedInGenders: data.interestedInGenders, minAge: data.minAge, maxAge: data.maxAge });
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: UpsertPreferenceInput) => api.updatePreferences(values),
    onSuccess: () => {
      setSavedMessage(SETTINGS_SAVED_MESSAGE);
      void queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{LOADING_MESSAGE}</p>;
  if (isError) return <ScreenError error={error} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{SETTINGS_PREFERENCES_TITLE}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{SETTINGS_GENDER_PREF_LABEL}</Label>
            <Controller
              control={control}
              name="interestedInGenders"
              render={({ field }) => (
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((option) => {
                    const selected = field.value.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            selected
                              ? field.value.filter((v) => v !== option.value)
                              : [...field.value, option.value],
                          )
                        }
                        className={cn(
                          "flex-1 rounded-lg border border-border px-3 py-2 text-sm",
                          selected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {option.labelFa}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{SETTINGS_AGE_RANGE_LABEL}</Label>
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="minAge"
                render={({ field }) => (
                  <input
                    type="number"
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="h-11 w-20 rounded-lg border border-input bg-transparent px-3 text-sm"
                  />
                )}
              />
              <span className="text-sm text-muted-foreground">تا</span>
              <Controller
                control={control}
                name="maxAge"
                render={({ field }) => (
                  <input
                    type="number"
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="h-11 w-20 rounded-lg border border-input bg-transparent px-3 text-sm"
                  />
                )}
              />
            </div>
          </div>

          <Button type="submit" disabled={saveMutation.isPending}>
            {SETTINGS_SAVE_LABEL}
          </Button>
          {savedMessage && <p className="text-center text-xs text-muted-foreground">{savedMessage}</p>}
          {saveMutation.isError && <p className="text-center text-xs text-destructive">{GENERIC_ERROR_MESSAGE}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function BlockedUsersCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["blocked"], queryFn: api.getBlockedUsers });

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => api.unblockUser(userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["blocked"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{SETTINGS_BLOCKED_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">{LOADING_MESSAGE}</p>}
        {!isLoading && (data?.blocked.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{SETTINGS_BLOCKED_EMPTY_MESSAGE}</p>
        )}
        {data?.blocked.map((entry) => (
          <div key={entry.userId} className="flex items-center justify-between rounded-lg border border-border p-2">
            <span className="text-sm">{entry.bio ?? "—"}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={unblockMutation.isPending}
              onClick={() => unblockMutation.mutate(entry.userId)}
            >
              {SETTINGS_UNBLOCK_LABEL}
            </Button>
          </div>
        ))}
        {unblockMutation.isSuccess && <p className="text-xs text-muted-foreground">{SETTINGS_UNBLOCKED_MESSAGE}</p>}
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  const deleteMutation = useMutation({ mutationFn: api.deleteAccount });

  if (deleteMutation.isSuccess) {
    return <p className="p-4 text-center text-sm text-muted-foreground">{SETTINGS_DELETED_MESSAGE}</p>;
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              {SETTINGS_DELETE_ACCOUNT_LABEL}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{SETTINGS_DELETE_CONFIRM_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{SETTINGS_DELETE_CONFIRM_BODY}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{SETTINGS_DELETE_CANCEL_LABEL}</AlertDialogCancel>
              <AlertDialogAction disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                {SETTINGS_DELETE_CONFIRM_ACTION_LABEL}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {deleteMutation.isError && <p className="mt-2 text-center text-xs text-destructive">{GENERIC_ERROR_MESSAGE}</p>}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">{SETTINGS_TITLE}</h1>
      <PreferencesCard />
      <BlockedUsersCard />
      <DeleteAccountCard />
    </main>
  );
}

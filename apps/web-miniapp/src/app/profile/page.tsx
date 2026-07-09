"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateAccountSchema, upsertProfileSchema } from "@ashena/shared";
import { z } from "zod";
import { api } from "@/lib/api";
import { GENDER_OPTIONS, INTEREST_OPTIONS, PROFILE_BIO_LABEL, PROFILE_BIRTH_DATE_LABEL, PROFILE_GENDER_LABEL, PROFILE_INTERESTS_LABEL, PROFILE_PHOTO_APPROVED_MESSAGE, PROFILE_PHOTO_LABEL, PROFILE_PHOTO_PENDING_MESSAGE, PROFILE_PHOTO_REJECTED_MESSAGE, PROFILE_PHOTO_UPLOAD_LABEL, PROFILE_SAVED_MESSAGE, PROFILE_SAVE_LABEL, PROFILE_TITLE, GENERIC_ERROR_MESSAGE, LOADING_MESSAGE } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AuthedImg } from "@/components/authed-media";
import { ScreenError } from "@/components/screen-error";
import { cn } from "@/lib/utils";

const profileFormSchema = upsertProfileSchema.merge(updateAccountSchema);
type ProfileFormValues = z.infer<typeof profileFormSchema>;

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading, isError, error } = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { displayBio: "", interests: [] },
  });

  useEffect(() => {
    if (!me) return;
    reset({
      gender: me.gender ?? undefined,
      birthDate: toDateInputValue(me.birthDate),
      displayBio: me.profile?.displayBio ?? "",
      interests: me.profile?.interests ?? [],
    });
  }, [me, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      await Promise.all([
        values.gender || values.birthDate
          ? api.updateAccount({ gender: values.gender, birthDate: values.birthDate })
          : Promise.resolve(),
        api.updateProfile({ displayBio: values.displayBio ?? null, interests: values.interests ?? [] }),
      ]);
    },
    onSuccess: () => {
      setSavedMessage(PROFILE_SAVED_MESSAGE);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => api.uploadProfilePhoto(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{LOADING_MESSAGE}</p>;
  }
  if (isError || !me) {
    return <ScreenError error={error} />;
  }

  const photoStatus = me.profile?.photoModerationStatus;

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold text-foreground">{PROFILE_TITLE}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{PROFILE_PHOTO_LABEL}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <div className="h-32 w-32 overflow-hidden rounded-full border border-border bg-muted">
            {me.profile?.photoUrl ? (
              <AuthedImg path={api.profilePhotoUrl(me.id)} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          {photoStatus === "pending" && <Badge variant="warning">{PROFILE_PHOTO_PENDING_MESSAGE}</Badge>}
          {photoStatus === "rejected" && <Badge variant="destructive">{PROFILE_PHOTO_REJECTED_MESSAGE}</Badge>}
          {photoStatus === "approved" && <Badge>{PROFILE_PHOTO_APPROVED_MESSAGE}</Badge>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) photoMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={photoMutation.isPending}>
            {PROFILE_PHOTO_UPLOAD_LABEL}
          </Button>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{PROFILE_GENDER_LABEL}</Label>
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field.onChange(option.value)}
                    className={cn(
                      "flex-1 rounded-full border border-border px-3 py-2 text-sm transition-colors",
                      field.value === option.value && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {option.labelFa}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="birthDate">{PROFILE_BIRTH_DATE_LABEL}</Label>
          <input
            id="birthDate"
            type="date"
            className="h-11 rounded-sm border border-input bg-transparent px-3 text-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("birthDate")}
          />
          {errors.birthDate && <p className="text-xs text-destructive">{errors.birthDate.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="displayBio">{PROFILE_BIO_LABEL}</Label>
          <Textarea id="displayBio" rows={4} {...register("displayBio")} />
          {errors.displayBio && <p className="text-xs text-destructive">{errors.displayBio.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>{PROFILE_INTERESTS_LABEL}</Label>
          <Controller
            control={control}
            name="interests"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((option) => {
                  const selected = (field.value ?? []).includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const current = field.value ?? [];
                        field.onChange(
                          selected ? current.filter((v) => v !== option.value) : [...current, option.value],
                        );
                      }}
                      className={cn(
                        "rounded-full border border-border px-3 py-1.5 text-xs",
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
          {errors.interests && <p className="text-xs text-destructive">{errors.interests.message}</p>}
        </div>

        <Button type="submit" disabled={saveMutation.isPending}>
          {PROFILE_SAVE_LABEL}
        </Button>
        {savedMessage && <p className="text-center text-xs text-muted-foreground">{savedMessage}</p>}
        {saveMutation.isError && <p className="text-center text-xs text-destructive">{GENERIC_ERROR_MESSAGE}</p>}
      </form>
    </main>
  );
}

"use server";

import { adminApi, type PendingPhotoDto } from "@/lib/admin-api";

export async function getPendingPhotosAction(): Promise<PendingPhotoDto[]> {
  return adminApi.photos.list();
}

export async function approvePhotoAction(userId: string): Promise<void> {
  await adminApi.photos.approve(userId);
}

export async function rejectPhotoAction(userId: string): Promise<void> {
  await adminApi.photos.reject(userId);
}

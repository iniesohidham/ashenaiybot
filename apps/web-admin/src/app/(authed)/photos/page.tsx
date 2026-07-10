import { adminApi } from "@/lib/admin-api";
import { PhotoQueue } from "./photo-queue";

export default async function PhotosPage() {
  const photos = await adminApi.photos.list();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">بررسی عکس‌ها</h1>
      <PhotoQueue initialPhotos={photos} />
    </div>
  );
}

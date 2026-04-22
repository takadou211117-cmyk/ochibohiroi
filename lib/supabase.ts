import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function uploadPhoto(
  file: File,
  userId: string,
  subjectId: string,
  sessionId: string
): Promise<{ url: string; key: string } | null> {
  try {
    const ext = file.name.split(".").pop() || "jpg";
    const key = `${userId}/${subjectId}/${sessionId}/${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error } = await supabaseAdmin.storage
      .from("lecture-photos")
      .upload(key, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }

    const { data } = supabaseAdmin.storage
      .from("lecture-photos")
      .getPublicUrl(key);

    return { url: data.publicUrl, key };
  } catch (err) {
    console.error("uploadPhoto error:", err);
    return null;
  }
}

export async function deletePhoto(key: string) {
  try {
    const { error } = await supabaseAdmin.storage
      .from("lecture-photos")
      .remove([key]);
    if (error) console.error("Delete photo error:", error);
  } catch (err) {
    console.error("deletePhoto error:", err);
  }
}

import { ProfileSettingsForm } from "@/components/auth/profile-settings-form";
import { requireServerSession } from "@/lib/auth-session";

export default async function SettingsPage() {
  const session = await requireServerSession("/settings");

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProfileSettingsForm
          name={session.user.name || ""}
          email={session.user.email}
        />
      </div>
    </div>
  );
}
